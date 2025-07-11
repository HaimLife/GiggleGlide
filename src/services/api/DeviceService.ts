import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DeviceInfo {
  uuid: string;
  model: string;
  platform: string;
  version: string;
  appVersion: string;
}

class DeviceService {
  private static instance: DeviceService;
  private deviceInfo: DeviceInfo | null = null;
  private readonly DEVICE_UUID_KEY = 'device_uuid';

  static getInstance(): DeviceService {
    if (!DeviceService.instance) {
      DeviceService.instance = new DeviceService();
    }
    return DeviceService.instance;
  }

  private constructor() {}

  /**
   * Get device UUID (persistent across app sessions)
   */
  async getDeviceUUID(): Promise<string> {
    try {
      // Try to get stored UUID first
      let uuid = await AsyncStorage.getItem(this.DEVICE_UUID_KEY);
      
      if (!uuid) {
        // Generate new UUID if not found
        uuid = this.generateUUID();
        await AsyncStorage.setItem(this.DEVICE_UUID_KEY, uuid);
      }
      
      return uuid;
    } catch (error) {
      console.error('Error getting device UUID:', error);
      // Fallback to generated UUID (won't persist if storage fails)
      return this.generateUUID();
    }
  }

  /**
   * Get comprehensive device information
   */
  async getDeviceInfo(): Promise<DeviceInfo> {
    if (this.deviceInfo) {
      return this.deviceInfo;
    }

    try {
      const uuid = await this.getDeviceUUID();
      
      this.deviceInfo = {
        uuid,
        model: Device.modelName || 'Unknown',
        platform: Device.osName || 'Unknown',
        version: Device.osVersion || 'Unknown',
        appVersion: Constants.expoConfig?.version || '1.0.0'
      };

      return this.deviceInfo;
    } catch (error) {
      console.error('Error getting device info:', error);
      
      // Fallback device info
      const uuid = await this.getDeviceUUID();
      this.deviceInfo = {
        uuid,
        model: 'Unknown',
        platform: 'Unknown',
        version: 'Unknown',
        appVersion: '1.0.0'
      };
      
      return this.deviceInfo;
    }
  }

  /**
   * Get device info string for API registration
   */
  async getDeviceInfoString(): Promise<string> {
    const info = await this.getDeviceInfo();
    return `${info.platform} ${info.version} - ${info.model} (App: ${info.appVersion})`;
  }

  /**
   * Clear stored device UUID (for testing or reset)
   */
  async clearDeviceUUID(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.DEVICE_UUID_KEY);
      this.deviceInfo = null;
    } catch (error) {
      console.error('Error clearing device UUID:', error);
    }
  }

  /**
   * Generate a random UUID
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Check if device is physical (not simulator/emulator)
   */
  isPhysicalDevice(): boolean {
    return Device.isDevice;
  }

  /**
   * Get device brand
   */
  getDeviceBrand(): string | null {
    return Device.brand;
  }

  /**
   * Get device manufacturer
   */
  getDeviceManufacturer(): string | null {
    return Device.manufacturer;
  }
}

export default DeviceService;