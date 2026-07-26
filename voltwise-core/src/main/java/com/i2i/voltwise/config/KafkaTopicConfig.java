package com.i2i.voltwise.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.config.TopicBuilder;

/** Ensures the application topics exist before the consumers start. */
@Configuration
@ConditionalOnProperty(prefix = "voltwise.kafka", name = "enabled", havingValue = "true", matchIfMissing = true)
public class KafkaTopicConfig {
  @Bean
  NewTopic telemetryTopic() {
    return TopicBuilder.name("voltwise.telemetry").partitions(1).replicas(1).build();
  }

  @Bean
  NewTopic registrationTopic() {
    return TopicBuilder.name("voltwise.registration").partitions(1).replicas(1).build();
  }
}
