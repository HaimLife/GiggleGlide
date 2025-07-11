import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean;
  type: string;
  details?: any;
}

export type NetworkListener = (state: NetworkState) => void;

class NetworkService {
  private static instance: NetworkService;
  private listeners: Set<NetworkListener> = new Set();
  private currentState: NetworkState = {
    isConnected: false,
    isInternetReachable: false,
    type: 'unknown'
  };
  private unsubscribe?: () => void;

  static getInstance(): NetworkService {
    if (!NetworkService.instance) {
      NetworkService.instance = new NetworkService();
    }
    return NetworkService.instance;
  }

  private constructor() {
    this.initialize();
  }

  private initialize() {
    // Set up network state listener
    this.unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const networkState: NetworkState = {
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable ?? false,
        type: state.type,
        details: state.details
      };

      const wasConnected = this.currentState.isConnected;
      this.currentState = networkState;

      // Notify all listeners
      this.listeners.forEach(listener => {
        try {
          listener(networkState);
        } catch (error) {
          console.error('Error in network listener:', error);
        }
      });

      // Log connection state changes
      if (wasConnected !== networkState.isConnected) {
        console.log(`Network ${networkState.isConnected ? 'connected' : 'disconnected'}`);
      }
    });

    // Get initial state
    NetInfo.fetch().then((state: NetInfoState) => {
      this.currentState = {
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable ?? false,
        type: state.type,
        details: state.details
      };
    });
  }

  /**
   * Get current network state
   */
  getState(): NetworkState {
    return { ...this.currentState };
  }

  /**
   * Check if device is connected to the internet
   */
  isConnected(): boolean {
    return this.currentState.isConnected && this.currentState.isInternetReachable !== false;
  }

  /**
   * Add a network state listener
   */
  addListener(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    
    // Call listener with current state
    listener(this.currentState);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Remove a network state listener
   */
  removeListener(listener: NetworkListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Wait for network connection
   */
  async waitForConnection(timeoutMs: number = 10000): Promise<boolean> {
    if (this.isConnected()) {
      return true;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        resolve(false);
      }, timeoutMs);

      const unsubscribe = this.addListener((state) => {
        if (state.isConnected && state.isInternetReachable !== false) {
          clearTimeout(timeout);
          unsubscribe();
          resolve(true);
        }
      });
    });
  }

  /**
   * Refresh network state
   */
  async refresh(): Promise<NetworkState> {
    const state = await NetInfo.fetch();
    this.currentState = {
      isConnected: state.isConnected ?? false,
      isInternetReachable: state.isInternetReachable ?? false,
      type: state.type,
      details: state.details
    };
    return this.getState();
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    this.listeners.clear();
  }
}

export default NetworkService;