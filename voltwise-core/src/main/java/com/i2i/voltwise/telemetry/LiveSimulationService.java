package com.i2i.voltwise.telemetry;

import com.i2i.voltwise.state.LiveModels;
import com.i2i.voltwise.state.LiveStateService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.concurrent.ThreadLocalRandom;

/** Keeps demo telemetry flowing when the external Kafka broker is disabled. */
@Service
public class LiveSimulationService {
  private final LiveStateService live;
  @Value("${voltwise.sensor-enabled:true}") boolean enabled;
  @Value("${voltwise.sensor-interval-ms:3000}") long intervalMs;

  public LiveSimulationService(LiveStateService live) { this.live = live; }

  @Scheduled(fixedDelayString = "${voltwise.sensor-interval-ms:3000}")
  public void refresh() {
    if (!enabled) return;
    var random = ThreadLocalRandom.current();
    for (LiveModels.HomeLive home : live.liveStates()) {
      double watts = 0;
      for (LiveModels.ApplianceLive device : home.appliances.values()) {
        double factor = random.nextDouble() < 0.08 ? random.nextDouble(0.95, 1.12) : random.nextDouble(0.20, 0.72);
        device.watts = Math.round(device.safeLimit * factor);
        device.anomalous = device.watts > device.safeLimit;
        device.breachCount = device.anomalous ? device.breachCount + 1 : 0;
        watts += device.watts;
      }
      double deltaKwh = watts / 1000d * intervalMs / 3_600_000d;
      home.energyKwh += deltaKwh;
      home.cost += deltaKwh * home.baseTariff * (home.penalty ? home.penaltyMultiplier : 1d);
      home.updatedAt = System.currentTimeMillis();
    }
  }
}
