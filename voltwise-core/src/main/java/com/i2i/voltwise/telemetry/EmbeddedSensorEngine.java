package com.i2i.voltwise.telemetry;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

/** Ücretli ayrı worker yerine core içinde çalışan demo sensör üreticisi. */
@Component
@ConditionalOnProperty(name="voltwise.sensor-enabled", havingValue="true", matchIfMissing=true)
public class EmbeddedSensorEngine {
  record Device(UUID id,String name,double limit){}
  private final Map<UUID,List<Device>> homes=new ConcurrentHashMap<>();
  private final ObjectMapper json; private final KafkaTemplate<String,String> kafka;
  @Value("${voltwise.kafka.telemetry-topic}") String telemetryTopic;
  EmbeddedSensorEngine(ObjectMapper json,KafkaTemplate<String,String> kafka){this.json=json;this.kafka=kafka;}
  @KafkaListener(topics="${voltwise.kafka.registration-topic}", autoStartup="${voltwise.kafka.enabled:true}") public void register(String payload){try{var root=json.readTree(payload);UUID home=UUID.fromString(root.get("homeId").asText());var devices=new ArrayList<Device>();root.withArray("appliances").forEach(a->devices.add(new Device(UUID.fromString(a.get("id").asText()),a.get("name").asText(),a.get("safeWattLimit").asDouble())));homes.put(home,devices);}catch(Exception ignored){}}
  @Scheduled(fixedDelayString="${voltwise.sensor-interval-ms}") public void emit(){var random=ThreadLocalRandom.current();homes.forEach((home,devices)->devices.forEach(d->{double factor=random.nextDouble()<.12?random.nextDouble(1.05,1.45):random.nextDouble(.25,.9);var event=Map.of("homeId",home,"applianceId",d.id(),"watts",Math.round(d.limit()*factor*10)/10d,"capturedAt",Instant.now().toString());try{kafka.send(telemetryTopic,home.toString(),json.writeValueAsString(event));}catch(Exception ignored){}}));}
}
