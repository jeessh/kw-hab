// Minimal ambient types for WebGazer (the package ships no declarations).
// We only touch the handful of methods used in useEyeTracking.
declare module "webgazer" {
  type GazeData = { x: number; y: number } | null;

  interface WebGazer {
    setGazeListener(
      cb: (data: GazeData, elapsedTime: number) => void,
    ): WebGazer;
    clearGazeListener(): WebGazer;
    begin(onFail?: () => void): Promise<WebGazer>;
    end(): WebGazer;
    pause(): WebGazer;
    resume(): Promise<WebGazer>;
    showVideoPreview(show: boolean): WebGazer;
    showPredictionPoints(show: boolean): WebGazer;
    recordScreenPosition(x: number, y: number, type?: string): void;
    saveDataAcrossSessions(save: boolean): WebGazer;
    applyKalmanFilter(apply: boolean): WebGazer;
    clearData(): Promise<void>;
    removeMouseEventListeners(): WebGazer;
    getTracker(): { getPositions?(): number[][] | null } | null;
  }

  const webgazer: WebGazer;
  export default webgazer;
}
