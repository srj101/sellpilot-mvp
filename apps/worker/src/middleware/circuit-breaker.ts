/**
 * Circuit Breaker Middleware
 * Protects against cascading failures
 */

export interface CircuitBreakerConfig {
  /** Timeout in milliseconds */
  timeout: number;
  /** Number of errors before opening circuit */
  errorThreshold: number;
  /** Time in ms before attempting to close circuit */
  resetTimeout: number;
  /** Fallback message when circuit is open */
  fallbackMessage: string;
}

type CircuitState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = "closed";
  private errorCount = 0;
  private lastErrorTime = 0;
  private successCount = 0;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /**
   * Run a function with circuit breaker protection
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from open to half-open
    if (this.state === "open") {
      const now = Date.now();
      if (now - this.lastErrorTime >= this.config.resetTimeout) {
        this.state = "half-open";
        this.successCount = 0;
        console.log("[CircuitBreaker] Transitioning to half-open");
      } else {
        console.log("[CircuitBreaker] Circuit is open, using fallback");
        throw new CircuitOpenError(this.config.fallbackMessage);
      }
    }

    try {
      // Run with timeout
      const result = await this.withTimeout(fn, this.config.timeout);

      // Success - update state
      this.onSuccess();

      return result;
    } catch (err) {
      // Failure - update state
      this.onError();

      throw err;
    }
  }

  /**
   * Check if circuit is currently open
   */
  isOpen(): boolean {
    return this.state === "open";
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit statistics
   */
  getStats(): {
    state: CircuitState;
    errorCount: number;
    successCount: number;
    lastErrorTime: number;
  } {
    return {
      state: this.state,
      errorCount: this.errorCount,
      successCount: this.successCount,
      lastErrorTime: this.lastErrorTime,
    };
  }

  /**
   * Manually reset the circuit
   */
  reset(): void {
    this.state = "closed";
    this.errorCount = 0;
    this.successCount = 0;
    this.lastErrorTime = 0;
    console.log("[CircuitBreaker] Manually reset to closed");
  }

  private async withTimeout<T>(
    fn: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new TimeoutError(`Operation timed out after ${timeout}ms`));
      }, timeout);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  private onSuccess(): void {
    if (this.state === "half-open") {
      this.successCount++;
      // Require 3 successful calls to close the circuit
      if (this.successCount >= 3) {
        this.state = "closed";
        this.errorCount = 0;
        console.log("[CircuitBreaker] Circuit closed after successful calls");
      }
    } else {
      // Reset error count on success
      this.errorCount = Math.max(0, this.errorCount - 1);
    }
  }

  private onError(): void {
    this.errorCount++;
    this.lastErrorTime = Date.now();

    if (this.state === "half-open") {
      // Any error in half-open goes back to open
      this.state = "open";
      console.log("[CircuitBreaker] Circuit reopened after error in half-open");
    } else if (this.errorCount >= this.config.errorThreshold) {
      this.state = "open";
      console.log(
        `[CircuitBreaker] Circuit opened after ${this.errorCount} errors`
      );
    }
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}
