import { Route, Bus } from './types';

export const ROUTES: Route[] = [
  {
    id: 'r1',
    number: '101A',
    name: 'Central Station - International Airport',
    color: '#3B82F6', // Blue
    stops: [
      { id: 's1', name: 'Central Station', lat: 12.9716, lng: 77.5946 },
      { id: 's2', name: 'Market Square', lat: 12.9816, lng: 77.5946 },
      { id: 's3', name: 'Tech Park East', lat: 12.9916, lng: 77.6046 },
      { id: 's4', name: 'Metro Junction', lat: 13.0016, lng: 77.6146 },
      { id: 's5', name: 'Highway Toll', lat: 13.0516, lng: 77.6546 },
      { id: 's6', name: 'International Airport', lat: 13.1986, lng: 77.7066 },
    ],
  },
  {
    id: 'r2',
    number: '202B',
    name: 'South Terminal - University Campus',
    color: '#10B981', // Green
    stops: [
      { id: 's10', name: 'South Terminal', lat: 12.9216, lng: 77.5846 },
      { id: 's11', name: 'City Hospital', lat: 12.9316, lng: 77.5846 },
      { id: 's12', name: 'Central Library', lat: 12.9416, lng: 77.5946 },
      { id: 's13', name: 'Arts College', lat: 12.9516, lng: 77.5946 },
      { id: 's14', name: 'University West Gate', lat: 12.9616, lng: 77.6046 },
    ],
  },
  {
    id: 'r3',
    number: '305C',
    name: 'Old Town - Business District',
    color: '#F59E0B', // Orange
    stops: [
      { id: 's20', name: 'Old Town Square', lat: 12.9616, lng: 77.5546 },
      { id: 's21', name: 'Heritage Museum', lat: 12.9716, lng: 77.5646 },
      { id: 's22', name: 'River Bridge', lat: 12.9816, lng: 77.5746 },
      { id: 's23', name: 'Stock Exchange', lat: 12.9916, lng: 77.5846 },
      { id: 's24', name: 'Financial Hub', lat: 13.0016, lng: 77.5946 },
    ],
  },
];

export const INITIAL_BUSES: Bus[] = [
  {
    id: 'bus1',
    routeId: 'r1',
    currentStopId: 's2',
    nextStopId: 's3',
    lat: 12.9850,
    lng: 77.5980,
    occupancy: 'medium',
    speed: 45,
    lastUpdated: new Date().toISOString(),
    status: 'on-time',
  },
  {
    id: 'bus2',
    routeId: 'r2',
    currentStopId: 's11',
    nextStopId: 's12',
    lat: 12.9350,
    lng: 77.5880,
    occupancy: 'high',
    speed: 30,
    lastUpdated: new Date().toISOString(),
    status: 'delayed',
  },
  {
    id: 'bus3',
    routeId: 'r3',
    currentStopId: 's23',
    nextStopId: 's24',
    lat: 12.9950,
    lng: 77.5880,
    occupancy: 'low',
    speed: 55,
    lastUpdated: new Date().toISOString(),
    status: 'early',
  },
];
