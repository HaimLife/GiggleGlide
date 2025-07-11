import { useState, useEffect } from 'react';
import { NetworkService, NetworkState } from '../services/api';

export interface UseNetworkStateResult extends NetworkState {
  isOffline: boolean;
  refresh: () => Promise<NetworkState>;
}

export const useNetworkState = (): UseNetworkStateResult => {
  const [networkState, setNetworkState] = useState<NetworkState>({
    isConnected: false,
    isInternetReachable: false,
    type: 'unknown'
  });

  useEffect(() => {
    const networkService = NetworkService.getInstance();
    
    // Get initial state
    setNetworkState(networkService.getState());
    
    // Subscribe to changes
    const unsubscribe = networkService.addListener(setNetworkState);
    
    return unsubscribe;
  }, []);

  const refresh = async (): Promise<NetworkState> => {
    const networkService = NetworkService.getInstance();
    const newState = await networkService.refresh();
    setNetworkState(newState);
    return newState;
  };

  return {
    ...networkState,
    isOffline: !networkState.isConnected || networkState.isInternetReachable === false,
    refresh
  };
};