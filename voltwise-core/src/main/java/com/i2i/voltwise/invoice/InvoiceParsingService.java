package com.i2i.voltwise.invoice;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.multipart.MultipartFile;

import java.util.Base64;
import java.util.List;
import java.util.Map;

/** Extracts the unit price and tariff type from an uploaded electricity bill image. */
@Service
public class InvoiceParsingService {
  private static final Logger log = LoggerFactory.getLogger(InvoiceParsingService.class);

  private static final String PROMPT = """
      Sana bir Türkiye elektrik faturası görseli veriyorum. Yalnızca "Fatura Detayı" başlıklı tablodaki bilgileri kullan.
      Enerji tüketim bedeli satırını bul ve "Birim Fiyat" değerini sayıya çevir. Gündüz, Puant ve Gece için ayrı
      satırlar varsa fatura çok zamanlıdır; yoksa tek kademelidir.
      Sadece şu JSON'u döndür, markdown ya da başka açıklama yazma:
      {"recognized": boolean, "unitPrice": number veya null, "singleTier": boolean, "tariffLabel": string}
      unitPrice değeri Türkçe ondalık virgülü nokta kabul edilerek okunmalıdır. Değer okunamıyorsa recognized false,
      unitPrice null ve tariffLabel "Bilinmiyor" döndür.
      """;

  private final RestClient http;
  private final ObjectMapper mapper = new ObjectMapper();

  @Value("${voltwise.gemini-api-key:}") String geminiApiKey;
  @Value("${voltwise.gemini-model}") String geminiModel;
  @Value("${voltwise.groq-api-key:}") String groqApiKey;
  @Value("${voltwise.groq-vision-model}") String groqVisionModel;

  public InvoiceParsingService(RestClient http) {
    this.http = http;
  }

  public InvoiceDtos.InvoiceParseResult parse(MultipartFile file) {
    try {
      String base64 = Base64.getEncoder().encodeToString(file.getBytes());
      String mime = "image/png".equals(file.getContentType()) ? "image/png" : "image/jpeg";

      if (groqApiKey != null && !groqApiKey.isBlank()) {
        return parseModelResponse(requestGroq(base64, mime));
      }
      if (geminiApiKey != null && !geminiApiKey.isBlank()) {
        return parseModelResponse(requestGemini(base64, mime));
      }
      return fallback("Fatura okuma için AI anahtarı bulunamadı; birim fiyatı elle girebilirsin.");
    } catch (Exception error) {
      log.warn("Invoice parse failed: {}", error.getMessage());
      return fallback("Fatura okunurken bir sorun oluştu; görseli netleştirip yeniden dene.");
    }
  }

  private String requestGroq(String base64, String mime) {
    Map<String, Object> body = Map.of(
        "model", groqVisionModel,
        "messages", List.of(Map.of(
            "role", "user",
            "content", List.of(
                Map.of("type", "text", "text", PROMPT),
                Map.of("type", "image_url", "image_url", Map.of("url", "data:" + mime + ";base64," + base64))
            ))),
        "temperature", 0.1,
        "max_completion_tokens", 700,
        "response_format", Map.of("type", "json_object"));
    Map<?, ?> response = http.post()
        .uri("https://api.groq.com/openai/v1/chat/completions")
        .header("Authorization", "Bearer " + groqApiKey)
        .body(body)
        .retrieve()
        .body(Map.class);
    var choices = (List<?>) response.get("choices");
    var message = (Map<?, ?>) ((Map<?, ?>) choices.get(0)).get("message");
    return String.valueOf(message.get("content"));
  }

  private String requestGemini(String base64, String mime) {
    Map<String, Object> body = Map.of("contents", List.of(Map.of("parts", List.of(
        Map.of("text", PROMPT),
        Map.of("inline_data", Map.of("mime_type", mime, "data", base64))
    ))));
    Map<?, ?> response = http.post()
        .uri("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", geminiModel)
        .header("x-goog-api-key", geminiApiKey)
        .body(body)
        .retrieve()
        .body(Map.class);
    var candidates = (List<?>) response.get("candidates");
    var content = (Map<?, ?>) ((Map<?, ?>) candidates.get(0)).get("content");
    var parts = (List<?>) content.get("parts");
    return String.valueOf(((Map<?, ?>) parts.get(0)).get("text"));
  }

  private InvoiceDtos.InvoiceParseResult parseModelResponse(String text) throws Exception {
    JsonNode node = mapper.readTree(text.replaceAll("```json|```", "").trim());
    boolean singleTier = node.path("singleTier").asBoolean(true);
    String tariffLabel = node.hasNonNull("tariffLabel") && !node.path("tariffLabel").asText().isBlank()
        ? node.path("tariffLabel").asText()
        : (singleTier ? "Tek Kademeli" : "Çok Zamanlı (Gündüz/Puant/Gece)");
    boolean recognized = node.path("recognized").asBoolean(false);
    Double unitPrice = recognized && node.hasNonNull("unitPrice") ? node.path("unitPrice").asDouble() : null;
    if (!recognized || unitPrice == null) {
      return new InvoiceDtos.InvoiceParseResult(false, null, singleTier, tariffLabel,
          "Faturadaki birim fiyat okunamadı; elle girebilirsin.");
    }
    return new InvoiceDtos.InvoiceParseResult(true, unitPrice, singleTier, tariffLabel, "Fatura başarıyla okundu.");
  }

  private InvoiceDtos.InvoiceParseResult fallback(String message) {
    return new InvoiceDtos.InvoiceParseResult(false, null, true, "Bilinmiyor", message);
  }
}
