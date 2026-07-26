package com.i2i.voltwise.home;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.i2i.voltwise.audit.SnapshotRepository;
import com.i2i.voltwise.home.HomeDtos.*;
import com.i2i.voltwise.state.LiveStateService;
import jakarta.transaction.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.TreeMap;
import java.util.UUID;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class HomeService {
    private static final Logger log = LoggerFactory.getLogger(HomeService.class);

    private final HomeRepository homes;
    private final SnapshotRepository snapshots;
    private final LiveStateService live;
    private final KafkaTemplate<String, String> kafka;
    private final ObjectMapper json;

    @Value("${voltwise.kafka.registration-topic}")
    String registrationTopic;

    public HomeService(HomeRepository homes, SnapshotRepository snapshots, LiveStateService live,
                       KafkaTemplate<String, String> kafka, ObjectMapper json) {
        this.homes = homes;
        this.snapshots = snapshots;
        this.live = live;
        this.kafka = kafka;
        this.json = json;
    }

    @Transactional
    public CreatedHome create(CreateHomeRequest request) {
        var home = new Home(UUID.randomUUID(), request.name(), request.email(), request.budgetLimit(),
                request.baseTariff(), request.penaltyMultiplier());
        request.appliances().forEach(appliance -> home.appliances.add(
                new Appliance(UUID.randomUUID(), home, appliance.name(), appliance.safeWattLimit())));
        homes.save(home);
        live.register(home);
        publishRegistrationEvent(home);
        return new CreatedHome(home.id, home.name);
    }

    @Transactional
    public void addAppliance(UUID homeId, ApplianceRequest request) {
        Home home = homes.findById(homeId)
                .orElseThrow(() -> new NoSuchElementException("Ev bulunamadi"));
        Appliance appliance = new Appliance(UUID.randomUUID(), home, request.name(), request.safeWattLimit());
        home.appliances.add(appliance);
        homes.save(home);
        live.addAppliance(home, appliance);
        publishRegistrationEvent(home);
    }

    public List<DailyTrend> history(UUID homeId, int days) {
        if (!homes.existsById(homeId)) throw new NoSuchElementException("Ev bulunamadi");
        return snapshots.findRecent(homeId, Instant.now().minus(Duration.ofDays(days))).stream()
                .collect(Collectors.groupingBy(snapshot -> snapshot.capturedAt.atZone(ZoneOffset.UTC).toLocalDate(),
                        TreeMap::new, Collectors.toList()))
                .entrySet().stream()
                .map(entry -> new DailyTrend(entry.getKey(),
                        entry.getValue().stream().mapToDouble(snapshot -> snapshot.energyKwh.doubleValue()).max().orElse(0),
                        entry.getValue().stream().mapToDouble(snapshot -> snapshot.cost.doubleValue()).max().orElse(0)))
                .toList();
    }

    private void publishRegistrationEvent(Home home) {
        try {
            kafka.send(registrationTopic, home.id.toString(), json.writeValueAsString(Map.of(
                    "homeId", home.id,
                    "name", home.name,
                    "appliances", home.appliances.stream().map(appliance -> Map.of(
                            "id", appliance.id,
                            "name", appliance.name,
                            "safeWattLimit", appliance.safeWattLimit
                    )).toList()
            ))).whenComplete((result, error) -> {
                if (error != null) {
                    log.warn("Kafka registration event failed; device remains saved: {}", error.getMessage());
                }
            });
        } catch (Exception error) {
            log.warn("Kafka registration event could not be prepared; device remains saved: {}", error.getMessage());
        }
    }
}
