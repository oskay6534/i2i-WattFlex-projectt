package com.i2i.voltwise.notification;

import com.i2i.voltwise.audit.Recommendation;
import com.i2i.voltwise.audit.RecommendationRepository;
import com.i2i.voltwise.home.Home;
import com.i2i.voltwise.state.LiveModels;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.text.Normalizer;
import java.util.Locale;

@Service
public class NotificationService {
  private static final Logger log = LoggerFactory.getLogger(NotificationService.class);
  private final RestClient http;
  private final JavaMailSender mail;
  private final RecommendationRepository recommendations;

  @Value("${voltwise.gemini-api-key:}") String apiKey;
  @Value("${voltwise.gemini-model}") String model;
  @Value("${voltwise.alert-from}") String from;

  public NotificationService(RestClient http, JavaMailSender mail,
                             RecommendationRepository recommendations) {
    this.http = http;
    this.mail = mail;
    this.recommendations = recommendations;
  }

  public void notify(Home home, LiveModels.HomeLive live, String reason) {
    String text = generate(live, reason, null);
    String status = "SKIPPED";
    try {
      if (!home.email.isBlank()) {
        var message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(home.email);
        message.setSubject("WattFlex enerji uyarısı");
        message.setText(text);
        mail.send(message);
        status = "SENT";
      }
    } catch (Exception ignored) {
      status = "FAILED";
    }
    recommendations.save(new Recommendation(home, text, status));
  }

  // Frontend'den gelen elektrikli araç (evContext) datasını da kabul edecek şekilde güncellendi
  public String advise(LiveModels.HomeLive live, String question, String evContext) {
    String reason = question == null || question.isBlank()
            ? "Genel tüketim profilini incele ve en etkili üç tasarruf adımını öner"
            : question;
    return generate(live, reason, evContext);
  }

  private String generate(LiveModels.HomeLive live, String reason, String evContext) {
    String fallback = fallbackAdvice(live, reason);
    if (apiKey == null || apiKey.isBlank()) return fallback;
    try {
      String prompt = "Sen WattFlex AI'sın; Türkçe konuşan, doğal ve yardımsever bir sohbet asistanısın. "
              + "Selamlaşma, kimlik ve gündelik sorulara normal chatbot gibi doğrudan cevap ver; bu sorularda enerji verisini zorla konuya katma. "
              + "Enerji, fatura, cihaz veya tasarruf sorularında aşağıdaki canlı veriyi kullanarak kısa, kişisel, sayısal ve uygulanabilir cevap ver. Ev=" + live.name
              + ", enerji=" + String.format("%.2f", live.energyKwh) + " kWh"
              + ", maliyet=" + String.format("%.2f", live.cost) + " TL"
              + ", bütçe=" + String.format("%.2f", live.budgetLimit) + " TL"
              + ", ceza tarifesi=" + live.penalty
              + ", anomaliler=" + live.appliances.values().stream()
              .filter(a -> a.anomalous).map(a -> a.name).toList();

      // Eğer sistemde kullanıcıya ait bir EV profili varsa bunu Gemini'a dahil ediyoruz
      if (evContext != null && !evContext.isBlank()) {
        prompt += ". Ek Bağlam: " + evContext;
      }

      prompt += ". Kullanıcı sorusu: " + reason;

      Map<String, Object> body = Map.of(
              "contents", List.of(Map.of("parts", List.of(Map.of("text", prompt)))),
              "generationConfig", Map.of("maxOutputTokens", 1024)
      );
      Map<?, ?> response = http.post()
              .uri("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", model)
              .header("x-goog-api-key", apiKey)
              .body(body).retrieve().body(Map.class);
      return extractAnswer(response, fallback);
    } catch (Exception error) {
      log.warn("Gemini request failed for model {}: {}", model, error.getMessage());
      return fallback;
    }
  }

  /** Gemini bazen boş aday ya da güvenlik nedeniyle eksik içerik döndürebilir. */
  private String extractAnswer(Map<?, ?> response, String fallback) {
    if (response == null) return fallback;
    Object candidatesValue = response.get("candidates");
    if (!(candidatesValue instanceof List<?> candidates) || candidates.isEmpty()) return fallback;
    if (!(candidates.get(0) instanceof Map<?, ?> candidate)) return fallback;
    if (!(candidate.get("content") instanceof Map<?, ?> content)) return fallback;
    if (!(content.get("parts") instanceof List<?> parts) || parts.isEmpty()) return fallback;
    if (!(parts.get(0) instanceof Map<?, ?> part)) return fallback;
    String answer = Objects.toString(part.get("text"), "").trim();
    return answer.isBlank() ? fallback : answer;
  }

  private String fallbackAdvice(LiveModels.HomeLive live, String reason) {
    double percent = live.budgetLimit == 0 ? 0 : live.cost / live.budgetLimit * 100;
    var highest = live.appliances.values().stream()
            .max((left, right) -> Double.compare(left.watts, right.watts)).orElse(null);
    String question = normalize(reason);

    if (question.contains("sen kimsin") || question.contains("kimsin")) {
      return "Ben WattFlex AI'yım. Akıllı evinizdeki cihaz tüketimlerini, bütçenizi ve tasarruf fırsatlarını takip etmenize yardımcı olurum.";
    }

    if (question.contains("nerelisin") || question.contains("nerede yasiyorsun")) {
      return "Ben fiziksel bir yerde yaşamıyorum; WattFlex uygulamasındaki enerji verilerinizi analiz eden dijital enerji asistanıyım. "
              + live.name + " için tüketiminizi birlikte takip edebiliriz.";
    }

    var askedDevice = findMentionedDevice(live, question);
    if (askedDevice != null) {
      String state = askedDevice.anomalous
              ? " Bu değer güvenli limitin üzerinde olduğu için dikkat gerektiriyor."
              : " Şu an güvenli çalışma aralığında.";
      return askedDevice.name + " şu anda " + String.format("%.0f", askedDevice.watts)
              + " W tüketiyor. Güvenli limiti " + String.format("%.0f", askedDevice.safeLimit)
              + " W." + state + " İstersen çalışma süresi ve tasarruf önerisini de inceleyebilirim.";
    }

    // Gemini geçici olarak cevap veremese bile, kullanıcının sorusuna canlı telemetriyle cevap ver.
    if (highest != null && (question.contains("en cok") || question.contains("en fazla")
            || question.contains("tuket") || question.contains("cihaz") || question.contains("elektr"))) {
      String state = highest.anomalous
              ? " Güvenli sınırı aştığı için anomali olarak işaretlendi."
              : " Şu an güvenli çalışma aralığında.";
      return "Şu an en çok elektrik tüketen cihaz " + highest.name + ". Anlık tüketimi "
              + String.format("%.0f", highest.watts) + " W, güvenli limiti "
              + String.format("%.0f", highest.safeLimit) + " W." + state;
    }

    if (question.contains("merhaba") || question.contains("nasilsin")) {
      return "Merhaba! " + live.name + " için " + String.format("%.2f", live.energyKwh)
              + " kWh tüketim ve " + String.format("%.2f", live.cost) + " TL maliyet görüyorum. "
              + (highest == null ? "Enerji verinizi birlikte inceleyebiliriz." : "İstersen " + highest.name + " cihazının tüketimini de analiz edebilirim.");
    }

    if (question.contains("3 adim") || question.contains("tasarruf plan")) {
      String deviceName = highest == null ? "yüksek güçlü cihazları" : highest.name + " cihazını";
      return "3 adımlı plan: 1) " + deviceName + " yoğun saatler dışında kullanın. "
              + "2) Bekleme modundaki cihazları kapatın. 3) Klimayı 24°C'ye ayarlayıp filtreyi temiz tutun. "
              + "Bu adımlar mevcut tüketiminizde yaklaşık %10–12 tasarruf sağlayabilir.";
    }

    if (question.contains("fatura") || question.contains("ay sonu") || question.contains("tahmin")) {
      double forecast = live.cost * 1.16;
      return "Mevcut kullanım eğilimine göre ay sonu maliyet tahmini " + String.format("%.2f", forecast)
              + " TL. Bütçeniz " + String.format("%.2f", live.budgetLimit) + " TL ve şu an kullanım oranınız %"
              + String.format("%.0f", percent) + ". " + (forecast > live.budgetLimit
              ? "Bütçe aşımı riskini azaltmak için yüksek tüketimli cihazları gece tarifesine alın."
              : "Bütçe içinde görünüyorsunuz; gece tarifesiyle maliyeti daha da azaltabilirsiniz.");
    }

    String priority = live.penalty
            ? "Ceza tarifesi etkin. Klima ve yüksek güçlü cihazları yoğun saatler dışında kullanın."
            : percent >= 80
            ? "Bütçenizin yüzde 80'ini geçtiniz. Bugün gereksiz bekleme tüketimini kapatın."
            : "Tüketiminiz kontrol altında. Programlı cihaz kullanımını sürdürün.";
    return "WattFlex AI analizi: " + priority
            + " Tahmini yüzde 12 tasarruf için klimayı 24°C'de çalıştırın, çamaşır makinesini tam dolu kullanın "
            + "ve gece bekleme yüklerini kapatın. Sorunuz: " + reason;
  }

  private LiveModels.ApplianceLive findMentionedDevice(LiveModels.HomeLive live, String question) {
    String alias = question.contains("buzdo") ? "buzdol"
            : question.contains("camasir") ? "camasir"
            : question.contains("bulasik") ? "bulasik"
            : question.contains("klima") ? "klima"
            : question.contains("televizyon") || question.contains("tv") ? "televizyon"
            : "";
    if (alias.isBlank()) return null;
    return live.appliances.values().stream()
            .filter(appliance -> normalize(appliance.name).contains(alias))
            .findFirst()
            .orElse(null);
  }

  private String normalize(String text) {
    String value = text == null ? "" : text.toLowerCase(Locale.forLanguageTag("tr-TR"));
    value = value.replace('ı', 'i').replace('ş', 's').replace('ğ', 'g').replace('ü', 'u').replace('ö', 'o').replace('ç', 'c');
    return Normalizer.normalize(value, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
  }
}
