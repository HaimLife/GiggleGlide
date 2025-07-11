export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  jitter: boolean;
  retryCondition?: (error: any) => boolean;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: any;
  attempts: number;
  totalTime: number;
}

class RetryService {
  private static readonly DEFAULT_OPTIONS: RetryOptions = {
    maxAttempts: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    backoffFactor: 2,
    jitter: true,
    retryCondition: (error: any) => {
      // Retry on network errors, 5xx errors, and timeouts
      if (error?.name === 'NetworkError') return true;
      if (error?.name === 'TypeError' && error?.message?.includes('fetch')) return true;
      if (error?.status >= 500) return true;
      if (error?.code === 'TIMEOUT') return true;
      return false;
    }
  };

  /**
   * Execute a function with retry logic and exponential backoff
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    options: Partial<RetryOptions> = {}
  ): Promise<RetryResult<T>> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();
    let lastError: any;
    
    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
      try {
        const data = await operation();
        
        return {
          success: true,
          data,
          attempts: attempt,
          totalTime: Date.now() - startTime
        };
      } catch (error) {
        lastError = error;
        
        // Don't retry if condition returns false
        if (opts.retryCondition && !opts.retryCondition(error)) {
          break;
        }
        
        // Don't delay on last attempt
        if (attempt < opts.maxAttempts) {
          const delay = this.calculateDelay(attempt, opts);
          console.log(`Retry attempt ${attempt} failed, retrying in ${delay}ms:`, error?.message);
          await this.sleep(delay);
        } else {
          console.log(`All ${opts.maxAttempts} retry attempts failed:`, error?.message);
        }
      }
    }
    
    return {
      success: false,
      error: lastError,
      attempts: opts.maxAttempts,
      totalTime: Date.now() - startTime
    };
  }

  /**
   * Calculate delay for exponential backoff with jitter
   */
  private static calculateDelay(attempt: number, options: RetryOptions): number {
    const exponentialDelay = options.baseDelay * Math.pow(options.backoffFactor, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, options.maxDelay);
    
    if (options.jitter) {
      // Add random jitter (±25% of delay)
      const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
      return Math.max(0, cappedDelay + jitter);
    }
    
    return cappedDelay;
  }

  /**
   * Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a retry wrapper for a specific function
   */
  static createRetryWrapper<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    options: Partial<RetryOptions> = {}
  ) {
    return async (...args: T): Promise<R> => {
      const result = await this.withRetry(() => fn(...args), options);
      
      if (result.success) {
        return result.data!;
      } else {
        throw result.error;
      }
    };
  }

  /**
   * Check if error should be retried based on default conditions
   */
  static shouldRetry(error: any): boolean {
    return this.DEFAULT_OPTIONS.retryCondition!(error);
  }
}

export default RetryService;