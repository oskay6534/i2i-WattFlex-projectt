package com.i2i.voltwise.home;

import com.i2i.voltwise.home.HomeDtos.*;
import com.i2i.voltwise.state.LiveStateService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/homes")
public class HomeController {

    private final HomeService service;
    private final LiveStateService live;

    public HomeController(HomeService s, LiveStateService l) {
        service = s;
        live = l;
    }

    @PostMapping
    public ResponseEntity<CreatedHome> create(@Valid @RequestBody CreateHomeRequest r) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(r));
    }

    @GetMapping("/status")
    public List<HomeStatus> all() {
        return live.all();
    }

    @GetMapping("/{id}/status")
    public HomeStatus status(@PathVariable("id") UUID id) {
        return live.status(id);
    }

    @GetMapping("/{id}/history")
    public List<DailyTrend> history(@PathVariable("id") UUID id, @RequestParam(value = "days", defaultValue="7") int days) {
        return service.history(id, Math.max(1, Math.min(days, 90)));
    }

    // YENİ EKLENEN ENDPOINT: Cihaz ekleme
    @PostMapping("/{id}/appliances")
    public ResponseEntity<Void> addAppliance(@PathVariable("id") UUID id, @Valid @RequestBody ApplianceRequest request) {
        service.addAppliance(id, request);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") UUID id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
