package com.i2i.voltwise.state;

import com.i2i.voltwise.home.Appliance;
import com.i2i.voltwise.home.Home;
import com.i2i.voltwise.home.HomeDtos.ApplianceStatus;
import com.i2i.voltwise.home.HomeDtos.HomeStatus;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.Collection;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Service
public class LiveStateService {
  private final ConcurrentMap<UUID, LiveModels.HomeLive> states = new ConcurrentHashMap<>();

  public void register(Home home) {
    var state = new LiveModels.HomeLive();
    state.id = home.id;
    state.name = home.name;
    state.email = home.email;
    state.budgetLimit = home.budgetLimit.doubleValue();
    state.baseTariff = home.baseTariff.doubleValue();
    state.penaltyMultiplier = home.penaltyMultiplier.doubleValue();
    home.appliances.forEach(appliance -> state.appliances.put(appliance.id,
        new LiveModels.ApplianceLive(appliance.id, appliance.name, appliance.safeWattLimit.doubleValue())));
    states.put(state.id, state);
  }

  /** Adds only the new device and deliberately keeps current watt, kWh and cost values. */
  public void addAppliance(Home home, Appliance appliance) {
    var state = states.get(home.id);
    if (state == null) {
      register(home);
      return;
    }
    var newDevice = new LiveModels.ApplianceLive(appliance.id, appliance.name, appliance.safeWattLimit.doubleValue());
    // Kafka devre dışı olduğunda da yeni cihaz eklenir eklenmez anlamlı bir anlık ölçüm görünsün.
    newDevice.watts = Math.round(appliance.safeWattLimit.doubleValue() * 0.35d);
    state.appliances.putIfAbsent(appliance.id, newDevice);
  }

  public LiveModels.HomeLive get(UUID id) { return states.get(id); }
  public Collection<LiveModels.HomeLive> liveStates() { return states.values(); }
  public void put(LiveModels.HomeLive state) { states.put(state.id, state); }
  public List<HomeStatus> all() { return states.values().stream().map(this::toDto).toList(); }

  public HomeStatus status(UUID id) {
    var state = get(id);
    if (state == null) throw new NoSuchElementException("Ev bulunamadi");
    return toDto(state);
  }

  private HomeStatus toDto(LiveModels.HomeLive state) {
    var devices = state.appliances.values().stream()
        .map(device -> new ApplianceStatus(device.id, device.name, device.watts, device.safeLimit,
            device.breachCount, device.anomalous))
        .toList();
    double percentage = state.budgetLimit == 0 ? 0 : state.cost / state.budgetLimit * 100;
    return new HomeStatus(state.id, state.name, state.email, state.energyKwh, state.cost,
        state.budgetLimit, percentage, state.penalty, percentage >= 80, devices);
  }
}
