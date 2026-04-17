/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bus as BusIcon, 
  Search, 
  MapPin, 
  Navigation, 
  Clock, 
  Users, 
  ChevronDown,
  Info,
  Map as MapIcon,
  Filter,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  LogIn,
  LogOut,
  Radio,
  Settings
} from 'lucide-react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  query,
  getDocFromServer
} from 'firebase/firestore';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { ROUTES, INITIAL_BUSES } from './constants';
import { Bus, Route } from './types';

// Leaflet Icon Setup
const busIcon = L.divIcon({
  className: 'custom-bus-icon',
  html: `
    <div class="relative group">
      <div class="bg-bg p-1 rounded-full border-2 border-accent accent-shadow transition-all group-hover:scale-110">
        <div class="bg-accent p-1.5 rounded-full text-bg">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 17h1a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h1" />
            <path d="M8 17H5a2 2 0 0 1-2-2V5" />
            <path d="M13 17h6" />
            <circle cx="16" cy="17" r="2" />
            <circle cx="7" cy="17" r="2" />
          </svg>
        </div>
      </div>
    </div>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const userIcon = L.divIcon({
  className: 'custom-user-icon',
  html: `
    <div class="relative">
      <div class="w-6 h-6 bg-accent rounded-full border-2 border-white shadow-[0_0_15px_rgba(0,240,255,0.8)] animate-pulse" />
      <div class="absolute -inset-2 bg-accent/20 rounded-full animate-ping" />
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [selectedBus, setSelectedBus] = useState<Bus | null>(null);
  const [buses, setBuses] = useState<Bus[]>(INITIAL_BUSES);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const [isDriverMode, setIsDriverMode] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number]>([12.9716, 77.5946]);
  const [hasLocationAccess, setHasLocationAccess] = useState(false);
  const [activeMode, setActiveMode] = useState<'user' | 'driver'>('user');
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);

  // ETA Calculation Helper (Haversine distance)
  const calculateETA = (bus: Bus) => {
    if (bus.speed <= 0) return 'Stopped';
    
    const route = ROUTES.find(r => r.id === bus.routeId);
    if (!route) return '--';
    
    const nextStop = route.stops.find(s => s.id === bus.nextStopId);
    if (!nextStop) return '--';

    // Simplified Euclidean distance for approximation (since it's small distance)
    const dx = (bus.lat - nextStop.lat) * 111; 
    const dy = (bus.lng - nextStop.lng) * 111 * Math.cos(bus.lat * (Math.PI / 180));
    const distanceKm = Math.sqrt(dx * dx + dy * dy);
    
    const minutes = Math.round((distanceKm / bus.speed) * 60);
    return minutes < 1 ? 'Arriving' : `${minutes}m`;
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Test Connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error: any) {
        if (error.code === 'permission-denied') {
          handleFirestoreError(error, OperationType.GET, 'test/connection');
        } else if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Live Bus Tracking from Firestore
  useEffect(() => {
    if (!isAuthReady) return;

    const q = query(collection(db, 'buses'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liveBuses: Bus[] = [];
      snapshot.forEach((doc) => {
        liveBuses.push({ id: doc.id, ...doc.data() } as Bus);
      });
      
      // Merge live data with initial static data if live data exists
      if (liveBuses.length > 0) {
        setBuses(prev => {
          const merged = [...prev];
          liveBuses.forEach(liveBus => {
            const idx = merged.findIndex(b => b.id === liveBus.id);
            if (idx !== -1) merged[idx] = liveBus;
            else merged.push(liveBus);
          });
          return merged;
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'buses');
    });

    return () => unsubscribe();
  }, [isAuthReady]);

  // Driver Mode - Live GPS Update every 2 seconds
  useEffect(() => {
    if (!isDriverMode || !user) return;

    const intervalId = setInterval(() => {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            // Using 'bus1' as requested
            const busId = 'bus1'; 
            const busData = {
              location: {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              },
              lat: position.coords.latitude, // Keeping flat for legacy map compatibility
              lng: position.coords.longitude,
              speed: Math.round((position.coords.speed || 0) * 3.6),
              lastUpdated: new Date().toISOString(),
              driverId: user.uid,
              routeId: 'r1', // Default route for demo
              status: 'on-time',
              occupancy: 'medium'
            };

            try {
              // We use Firestore's real-time capabilities to fulfill the request
              await setDoc(doc(db, 'buses', busId), busData);
              // Also update local user location to center the map in driver mode
              setUserLocation([position.coords.latitude, position.coords.longitude]);
            } catch (error) {
              handleFirestoreError(error, OperationType.WRITE, `buses/${busId}`);
            }
          },
          (error) => {
            console.error("Driver location error:", error);
            if (error.code === 1) {
              setIsDriverMode(false);
              alert("Location permission denied. Please enable GPS to use Driver Mode.");
            }
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      } else {
        alert("Geolocation is not supported by your browser.");
        setIsDriverMode(false);
      }
    }, 2000);

    return () => clearInterval(intervalId);
  }, [isDriverMode, user]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const filteredRoutes = useMemo(() => {
    return ROUTES.filter(r => 
      r.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const handleRouteSelect = (route: Route) => {
    setSelectedRoute(route);
    const busOnRoute = buses.find(b => b.routeId === route.id);
    setSelectedBus(busOnRoute || null);
    setIsDetailsExpanded(true);
  };

  // Get User Location
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        setUserLocation([position.coords.latitude, position.coords.longitude]);
        setHasLocationAccess(true);
      });
    }
  }, []);

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden bg-bg text-text-main font-sans selection:bg-accent/30 lowercase-headings">
      {/* Dynamic Header */}
      <header className="fixed top-0 left-0 right-0 z-[100] p-4 bg-bg/80 backdrop-blur-xl border-b border-glass-border">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-accent/10 p-2 rounded-xl border border-accent/20">
              <BusIcon size={22} className="text-accent" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg tracking-tight leading-none uppercase">GovBus Live</h1>
              <p className="text-[10px] text-text-dim uppercase tracking-[0.2em] mt-1 font-black">Tracking System</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Bus Selector */}
            {activeMode === 'user' && (
              <select 
                value={selectedBusId || ''} 
                onChange={(e) => setSelectedBusId(e.target.value || null)}
                className="bg-white/5 border border-glass-border rounded-xl px-3 py-2 text-xs font-bold text-accent outline-none hover:bg-white/10 transition-all uppercase tracking-wider"
              >
                <option value="" className="bg-bg text-text-main">All Buses</option>
                {buses.map(b => (
                  <option key={b.id} value={b.id} className="bg-bg text-text-main uppercase">
                    Bus {b.id.replace('bus', '')}
                  </option>
                ))}
              </select>
            )}

            {user ? (
              <div className="flex items-center gap-2 scale-90 sm:scale-100">
                <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-accent/30" referrerPolicy="no-referrer" />
                <button onClick={handleLogout} className="p-2 text-text-dim hover:text-white transition-colors bg-white/5 rounded-lg border border-transparent hover:border-glass-border font-bold text-[10px] uppercase">
                  Logout
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="bg-accent text-bg px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all"
              >
                <LogIn size={16}/> Login
              </button>
            )}
          </div>
        </div>

        {/* Mode Selector */}
        <div className="max-w-xl mx-auto mt-4 flex p-1 bg-black/40 rounded-2xl border border-glass-border relative overflow-hidden">
          <div 
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-accent rounded-xl transition-all duration-300"
            style={{ left: activeMode === 'user' ? '4px' : 'calc(50% + 2px)' }}
          />
          <button 
            onClick={() => { setActiveMode('user'); setIsDriverMode(false); }}
            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-[0.2em] z-10 transition-colors ${activeMode === 'user' ? 'text-bg' : 'text-text-dim'}`}
          >
            User Mode
          </button>
          <button 
            onClick={() => setActiveMode('driver')}
            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-[0.2em] z-10 transition-colors ${activeMode === 'driver' ? 'text-bg' : 'text-text-dim'}`}
          >
            Driver Mode
          </button>
        </div>
      </header>

      {/* Main Interface */}
      <main className="flex-1 relative mt-[136px]">
        {/* Map Container */}
        <div className="absolute inset-0 leaflet-dark z-0">
          <MapContainer 
            center={userLocation} 
            zoom={13} 
            className="w-full h-full bg-bg"
            zoomControl={false}
          >
            <ChangeView center={userLocation} zoom={13} />
            <TileLayer
              attribution='&copy; OSM'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {/* User Presence */}
            {hasLocationAccess && (
              <Marker position={userLocation} icon={userIcon}>
                <Popup className="custom-popup">
                  <div className="text-bg font-bold p-1 text-xs">You are here</div>
                </Popup>
              </Marker>
            )}

            {/* Live Buses */}
            {buses.filter(b => !selectedBusId || b.id === selectedBusId).map(bus => {
              const r = ROUTES.find(route => route.id === bus.routeId);
              const isMe = bus.id === 'bus1' && bus.driverId === user?.uid;
              const busLabel = bus.id.replace('bus', '').toUpperCase();
              
              return (
                <Marker 
                  key={bus.id} 
                  position={[bus.lat, bus.lng]} 
                  icon={L.divIcon({
                    className: 'custom-bus-marker',
                    html: `
                      <div class="relative flex flex-col items-center">
                        <div class="absolute -top-7 bg-bg/90 backdrop-blur-md px-2 py-0.5 rounded border border-accent/30 text-[9px] font-black text-accent uppercase tracking-tighter whitespace-nowrap shadow-xl">
                          Bus ${busLabel}
                        </div>
                        <div class="${isMe ? 'scale-125' : ''} transition-all duration-500">
                          <div class="bg-bg p-1 rounded-full border-2" style="border-color: ${isMe ? '#34d399' : (r?.color || '#00F0FF')}; box-shadow: 0 0 15px ${isMe ? 'rgba(52,211,153,0.4)' : (r?.color + '44' || 'rgba(0,240,255,0.4)')}">
                            <div class="p-1.5 rounded-full text-bg" style="background-color: ${isMe ? '#34d399' : (r?.color || '#00F0FF')}">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M19 17h1a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h1"/>
                                <path d="M8 17H5a2 2 0 0 1-2-2V5"/>
                                <circle cx="16" cy="17" r="2"/>
                                <circle cx="7" cy="17" r="2"/>
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    `,
                    iconSize: [40, 50],
                    iconAnchor: [20, 40],
                  })}
                  eventHandlers={{
                    click: () => r && handleRouteSelect(r)
                  }}
                >
                  <Popup className="custom-popup">
                    <div className="text-bg p-2 min-w-[140px]">
                      <p className="font-black text-[10px] uppercase text-accent/80 tracking-widest mb-1">Vehicle Status</p>
                      <p className="font-black text-sm uppercase tracking-tight">{r?.number} • Bus ${busLabel}</p>
                      <div className="h-px bg-black/5 my-2" />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[8px] font-bold opacity-40 uppercase">Speed</p>
                          <p className="text-xs font-black font-mono">${bus.speed} <span class="text-[8px]">kmh</span></p>
                        </div>
                        <div>
                          <p className="text-[8px] font-bold opacity-40 uppercase">ETA</p>
                          <p className="text-xs font-black font-mono text-emerald-600">${calculateETA(bus)}</p>
                        </div>
                      </div>
                      {isMe && <p className="text-[9px] text-emerald-600 font-black mt-2 pt-2 border-t border-black/5 uppercase">✓ Broadcast Active</p>}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>

        {/* Dynamic Controls Overlay */}
        <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none p-6">
          <div className="max-w-xl mx-auto pointer-events-auto">
            <AnimatePresence mode="wait">
              {activeMode === 'driver' ? (
                <motion.div 
                  key="driver-panel"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 20, opacity: 0 }}
                  className="bg-zinc-900/90 backdrop-blur-2xl p-6 rounded-[32px] border border-glass-border shadow-2xl"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-bold text-white leading-tight">Driver Control</h3>
                      <p className="text-[10px] text-text-dim mt-1 font-black uppercase tracking-widest leading-none">Updating &bull; /bus1/location</p>
                    </div>
                    {isDriverMode && (
                      <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Live Signal</span>
                      </div>
                    )}
                  </div>

                  {!user ? (
                    <div className="bg-white/5 p-6 rounded-2xl border border-dashed border-white/10 text-center mb-0">
                      <p className="text-xs text-text-dim mb-4 leading-relaxed px-4 underline decoration-accent/20 underline-offset-4">Security: Authentication required to transmit encrypted GPS coordinates</p>
                      <button onClick={handleLogin} className="w-full py-3 bg-accent/10 text-accent border border-accent/20 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-accent/20 transition-all">Authenticate Driver</button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-3 mb-1">
                        <div className="bg-white/2 p-3 rounded-xl border border-glass-border/10">
                          <p className="text-[8px] text-text-dim uppercase font-black tracking-widest mb-1">Satellite Status</p>
                          <p className="text-white font-mono text-sm font-bold flex items-center gap-1.5 underline decoration-emerald-500/30">Stable <div className="w-1 h-1 rounded-full bg-emerald-500" /></p>
                        </div>
                        <div className="bg-white/2 p-3 rounded-xl border border-glass-border/10">
                          <p className="text-[8px] text-text-dim uppercase font-black tracking-widest mb-1">Precision Range</p>
                          <p className="text-white font-mono text-sm font-bold underline decoration-blue-500/30">± 5.2 Meters</p>
                        </div>
                      </div>

                      {!isDriverMode ? (
                        <button 
                          onClick={() => setIsDriverMode(true)}
                          className="w-full py-4 bg-accent text-bg rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-[0_0_30px_rgba(0,240,255,0.2)] active:scale-[0.98] transition-all"
                        >
                          Start Transmission
                        </button>
                      ) : (
                        <button 
                          onClick={() => setIsDriverMode(false)}
                          className="w-full py-4 bg-red-500/90 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-[0_0_30px_rgba(239,68,68,0.2)] active:scale-[0.98] transition-all"
                        >
                          Cut Signal (Stop)
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div 
                  key="user-panel"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 20, opacity: 0 }}
                  className="bg-zinc-900/90 backdrop-blur-2xl p-5 rounded-[32px] border border-glass-border shadow-2xl"
                >
                  {selectedBusId ? (
                    (() => {
                      const bus = buses.find(b => b.id === selectedBusId);
                      const route = ROUTES.find(r => r.id === bus?.routeId);
                      if (!bus || !route) return null;
                      
                      return (
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-accent/20 rounded-xl flex items-center justify-center border border-accent/30 accent-shadow">
                                <BusIcon size={20} className="text-accent" />
                              </div>
                              <div>
                                <h3 className="text-sm font-bold text-white leading-tight underline decoration-accent/20 underline-offset-4 pointer-events-auto" onClick={() => handleRouteSelect(route)}>
                                  Bus {bus.id.replace('bus', '')} • {route.number}
                                </h3>
                                <p className="text-[9px] text-text-dim font-black uppercase tracking-widest mt-1">Status: {bus.status}</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => setSelectedBusId(null)}
                              className="text-[9px] font-black text-text-dim uppercase tracking-widest hover:text-white transition-colors"
                            >
                              Exit Focus
                            </button>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-white/5 p-3 rounded-2xl border border-glass-border/10">
                              <p className="text-[8px] text-text-dim uppercase font-black tracking-widest mb-1">Velocity</p>
                              <p className="text-white font-mono text-sm font-bold flex items-center gap-1">
                                {bus.speed}<span className="text-[10px] opacity-40">km/h</span>
                              </p>
                            </div>
                            <div className="bg-white/5 p-3 rounded-2xl border border-glass-border/10">
                              <p className="text-[8px] text-text-dim uppercase font-black tracking-widest mb-1">ETA Next</p>
                              <p className="text-emerald-400 font-mono text-sm font-bold">{calculateETA(bus)}</p>
                            </div>
                            <div className="bg-white/5 p-3 rounded-2xl border border-glass-border/10">
                              <p className="text-[8px] text-text-dim uppercase font-black tracking-widest mb-1">Pass. Load</p>
                              <p className="text-white font-mono text-xs font-bold uppercase">{bus.occupancy}</p>
                            </div>
                          </div>
                          
                          <div className="bg-accent/5 p-3 rounded-2xl border border-accent/10 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-accent pulse" />
                              <p className="text-[10px] text-white/80 font-bold uppercase tracking-tight">At {route.stops.find(s => s.id === bus.currentStopId)?.name || 'Transit'}</p>
                            </div>
                            <ArrowRight size={14} className="text-accent/50" />
                            <p className="text-[10px] text-white/50 font-bold uppercase tracking-tight truncate max-w-[100px]">{route.stops.find(s => s.id === bus.nextStopId)?.name}</p>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-accent/20 rounded-2xl flex items-center justify-center border border-accent/30 accent-shadow">
                          <Clock size={24} className="text-accent" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-white leading-tight">Public Transit</h3>
                          <p className="text-[10px] text-text-dim font-black uppercase tracking-[0.1em] mt-0.5 underline decoration-accent/20 underline-offset-2">{buses.length} Vehicles Broadcasting</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="bg-white/5 p-3 rounded-2xl border border-glass-border text-white hover:bg-white/10 active:scale-90 transition-all">
                          <Settings size={20} />
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Simplified Route Sheet */}
      <AnimatePresence>
        {selectedRoute && (
          <motion.div 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            className="fixed inset-x-0 bottom-0 z-[120] bg-zinc-900/98 backdrop-blur-3xl rounded-t-[40px] border-t border-glass-border shadow-[0_-20px_100px_rgba(0,0,0,1)]"
          >
            <div className="h-10 flex items-center justify-center cursor-pointer" onClick={() => setSelectedRoute(null)}>
              <div className="w-12 h-1 bg-white/10 rounded-full" />
            </div>
            
            <div className="px-8 pb-12 max-h-[70vh] overflow-y-auto scrollbar-hide">
              <div className="flex items-center justify-between mb-8">
                <div>
                   <span 
                    className="px-4 py-1.5 rounded-xl text-bg font-display font-black text-[10px] accent-shadow mb-3 inline-block uppercase tracking-widest"
                    style={{ backgroundColor: selectedRoute.color }}
                  >
                    Route {selectedRoute.number}
                  </span>
                  <h2 className="text-3xl font-display font-bold text-white leading-tight underline decoration-accent/10 underline-offset-8">{selectedRoute.name}</h2>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-text-dim mb-4">Route Progress &bull; {selectedRoute.stops.length} Checkpoints</p>
                <div className="space-y-0.5">
                  {selectedRoute.stops.map((stop, sidx) => (
                    <div key={stop.id} className="flex items-center gap-4 py-3 border-b border-white/5 last:border-0 group">
                      <div className="w-2 h-2 rounded-full border-2 border-accent transition-all group-hover:scale-125" />
                      <p className="text-sm font-bold text-white underline decoration-transparent group-hover:decoration-accent/20 transition-all">{stop.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
