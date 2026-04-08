// ===============================
// 📍 IMU Tracker (Step Detection)
// ===============================

import { Accelerometer } from "expo-sensors";

type MotionState = {
  steps: number;
  isMoving: boolean;
};

let steps = 0;
let isMoving = false;

let lastMagnitude = 0;
let lastStepTime = 0;

const STEP_THRESHOLD = 1.2;      // tweak later
const STEP_COOLDOWN = 400;       // ms between steps

let subscription: any = null;

// -------- Start tracking --------
export function startIMU() {
  Accelerometer.setUpdateInterval(100); // 10 Hz

  subscription = Accelerometer.addListener((data) => {
    const { x, y, z } = data;

    // magnitude of acceleration vector
    const magnitude = Math.sqrt(x * x + y * y + z * z);

    const now = Date.now();

    // detect spike (step)
    if (
      magnitude > STEP_THRESHOLD &&
      lastMagnitude <= STEP_THRESHOLD &&
      now - lastStepTime > STEP_COOLDOWN
    ) {
      steps++;
      lastStepTime = now;
      isMoving = true;
    }

    lastMagnitude = magnitude;

    // detect stop (no steps for 2 sec)
    if (now - lastStepTime > 2000) {
      isMoving = false;
    }
  });
}

// -------- Stop tracking --------
export function stopIMU() {
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
}

// -------- Get state --------
export function getMotion(): MotionState {
  return {
    steps,
    isMoving,
  };
}

// -------- Reset --------
export function resetMotion() {
  steps = 0;
}