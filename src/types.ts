export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  arrivalTime?: string;
}

export interface Route {
  id: string;
  number: string;
  name: string;
  color: string;
  stops: Stop[];
}

export interface Bus {
  id: string;
  routeId: string;
  currentStopId: string;
  nextStopId: string;
  lat: number;
  lng: number;
  occupancy: 'low' | 'medium' | 'high';
  speed: number;
  lastUpdated: string;
  status: 'on-time' | 'delayed' | 'early';
}
