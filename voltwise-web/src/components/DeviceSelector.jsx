import React, { useState, useRef, useEffect } from 'react';

// Genişletilmiş popüler cihazlar ve onlara özel watt (W/h) sınırları
const POPULAR_DEVICES = [
    { id: 1, name: 'Kettle (Su Isıtıcı)', power: { az: 1200, orta: 1400, yuksek: 1800 } },
    { id: 2, name: 'Ütü', power: { az: 1500, orta: 2000, yuksek: 2400 } },
    { id: 3, name: 'Çamaşır Makinesi', power: { az: 500, orta: 800, yuksek: 1200 } },
    { id: 4, name: 'Bulaşık Makinesi', power: { az: 1000, orta: 1500, yuksek: 2000 } },
    { id: 5, name: 'Saç Kurutma Makinesi', power: { az: 1200, orta: 1600, yuksek: 2200 } },
    { id: 6, name: 'Televizyon', power: { az: 50, orta: 100, yuksek: 150 } },
    { id: 7, name: 'Buzdolabı', power: { az: 100, orta: 200, yuksek: 300 } },
    { id: 8, name: 'Elektrikli Süpürge', power: { az: 600, orta: 900, yuksek: 1200 } },
    { id: 9, name: 'Fırın', power: { az: 2000, orta: 2500, yuksek: 3000 } },
    { id: 10, name: 'Klima', power: { az: 1000, orta: 1500, yuksek: 2500 } },

    // Yeni Eklenen Cihazlar
    { id: 11, name: 'Çamaşır Kurutma Makinesi (Yoğuşmalı)', power: { az: 2000, orta: 2500, yuksek: 3000 } },
    { id: 12, name: 'Çamaşır Kurutma Makinesi (Isı Pompalı)', power: { az: 600, orta: 800, yuksek: 1000 } },
    { id: 13, name: 'Telefon Adaptörü', power: { az: 5, orta: 15, yuksek: 25 } }, // Standart, Hızlı, Süper Hızlı
    { id: 14, name: 'Laptop Adaptörü', power: { az: 45, orta: 65, yuksek: 140 } }, // Ofis, Pro, Gaming Serisi
    { id: 15, name: 'Lamba (LED)', power: { az: 5, orta: 9, yuksek: 15 } },
    { id: 16, name: 'Lamba (Akkor/Tasarruflu)', power: { az: 20, orta: 40, yuksek: 60 } },
    { id: 17, name: 'Masaüstü Bilgisayar (Kasa)', power: { az: 150, orta: 350, yuksek: 650 } },
    { id: 18, name: 'Oyun Konsolu (PS/Xbox)', power: { az: 50, orta: 150, yuksek: 250 } }, // Bekleme, Normal, Tam Yük
    { id: 19, name: 'Mikrodalga Fırın', power: { az: 600, orta: 800, yuksek: 1100 } },
    { id: 20, name: 'Derin Dondurucu', power: { az: 100, orta: 150, yuksek: 250 } },
    { id: 21, name: 'Tost Makinesi', power: { az: 700, orta: 1000, yuksek: 1500 } },
    { id: 22, name: 'Kahve Makinesi', power: { az: 600, orta: 1000, yuksek: 1450 } },
    { id: 23, name: 'Elektrikli Isıtıcı (Soba)', power: { az: 1000, orta: 1500, yuksek: 2000 } },
    { id: 24, name: 'Kombi', power: { az: 90, orta: 120, yuksek: 160 } },
    { id: 25, name: 'Vantilatör', power: { az: 30, orta: 50, yuksek: 80 } }
];

const DeviceSelector = ({ onDeviceDataChange }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState(null);

    const [selectedPowerLevel, setSelectedPowerLevel] = useState(null);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredDevices = POPULAR_DEVICES.filter(device =>
        device.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleDeviceSelect = (device) => {
        setSelectedDevice(device);
        setSearchTerm(device.name);
        setIsDropdownOpen(false);
        setSelectedPowerLevel(null);
    };

    const handlePowerSelect = (level) => {
        setSelectedPowerLevel(level);
        if (onDeviceDataChange && selectedDevice) {
            onDeviceDataChange({
                id: selectedDevice.id,
                name: selectedDevice.name,
                level: level,
                watt: selectedDevice.power[level]
            });
        }
    };

    return (
        <div ref={dropdownRef} style={{ position: 'relative', width: '100%', maxWidth: '400px', marginBottom: '20px' }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontWeight: 'bold', fontSize: '14px', color: '#111827' }}>Cihaz Ekle</label>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setIsDropdownOpen(true);
                        if (selectedDevice && e.target.value !== selectedDevice.name) {
                            setSelectedDevice(null);
                            setSelectedPowerLevel(null);
                        }
                    }}
                    onClick={() => setIsDropdownOpen(true)}
                    placeholder="Cihaz ara (örn: Laptop Adaptörü)..."
                    style={{
                        width: '100%', padding: '10px', boxSizing: 'border-box',
                        borderRadius: '6px', border: '1px solid #ccc', fontSize: '16px', color: '#111827', backgroundColor: '#fff'
                    }}
                />
            </div>

            {isDropdownOpen && (
                <ul style={{
                    position: 'absolute', top: '70px', left: 0, right: 0,
                    background: '#fff', border: '1px solid #ccc', borderRadius: '6px',
                    zIndex: 100, listStyle: 'none', padding: 0, margin: 0,
                    maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', color: '#111827'
                }}>
                    {filteredDevices.length > 0 ? (
                        filteredDevices.map(device => (
                            <li
                                key={device.id}
                                onClick={() => handleDeviceSelect(device)}
                                style={{ padding: '12px 10px', cursor: 'pointer', borderBottom: '1px solid #eee', color: '#111827', fontWeight: 600 }}
                                onMouseEnter={(e) => e.target.style.backgroundColor = '#f8f9fa'}
                                onMouseLeave={(e) => e.target.style.backgroundColor = '#fff'}
                            >
                                {device.name}
                            </li>
                        ))
                    ) : (
                        <li style={{ padding: '12px 10px', color: '#888' }}>Cihaz bulunamadı...</li>
                    )}
                </ul>
            )}

            {selectedDevice && (
                <div style={{ marginTop: '15px' }}>
                    <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold', color: '#555' }}>
                        {selectedDevice.name} - Güç Seviyesi
                    </p>
                    <div style={{ display: 'flex', gap: '10px' }}>

                        <button
                            type="button"
                            onClick={() => handlePowerSelect('az')}
                            style={{
                                flex: 1, padding: '10px', cursor: 'pointer', border: '2px solid #3b82f6',
                                borderRadius: '8px', transition: 'all 0.2s',
                                backgroundColor: selectedPowerLevel === 'az' ? '#3b82f6' : 'transparent',
                                color: selectedPowerLevel === 'az' ? '#fff' : '#3b82f6'
                            }}
                        >
                            <strong>Az</strong><br/>
                            <span style={{ fontSize: '12px' }}>{selectedDevice.power.az} W/h</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => handlePowerSelect('orta')}
                            style={{
                                flex: 1, padding: '10px', cursor: 'pointer', border: '2px solid #3b82f6',
                                borderRadius: '8px', transition: 'all 0.2s',
                                backgroundColor: selectedPowerLevel === 'orta' ? '#3b82f6' : 'transparent',
                                color: selectedPowerLevel === 'orta' ? '#fff' : '#3b82f6'
                            }}
                        >
                            <strong>Orta</strong><br/>
                            <span style={{ fontSize: '12px' }}>{selectedDevice.power.orta} W/h</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => handlePowerSelect('yuksek')}
                            style={{
                                flex: 1, padding: '10px', cursor: 'pointer', border: '2px solid #3b82f6',
                                borderRadius: '8px', transition: 'all 0.2s',
                                backgroundColor: selectedPowerLevel === 'yuksek' ? '#3b82f6' : 'transparent',
                                color: selectedPowerLevel === 'yuksek' ? '#fff' : '#3b82f6'
                            }}
                        >
                            <strong>Yüksek</strong><br/>
                            <span style={{ fontSize: '12px' }}>{selectedDevice.power.yuksek} W/h</span>
                        </button>

                    </div>
                </div>
            )}
        </div>
    );
};

export default DeviceSelector;
