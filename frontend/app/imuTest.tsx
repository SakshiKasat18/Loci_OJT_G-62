import { View, Text, Button } from "react-native";
import { useEffect, useState } from "react";
import { startIMU, stopIMU, getMotion, resetMotion } from "../services/imuTracker";

export default function IMUTest() {
  const [steps, setSteps] = useState(0);
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    startIMU();

    const interval = setInterval(() => {
      const motion = getMotion();
      setSteps(motion.steps);
      setIsMoving(motion.isMoving);
    }, 200);

    return () => {
      stopIMU();
      clearInterval(interval);
    };
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text style={{ fontSize: 24 }}>Steps: {steps}</Text>
      <Text style={{ fontSize: 20 }}>
        Status: {isMoving ? "Moving 🚶" : "Still 🧍"}
      </Text>

      <View style={{ height: 20 }} />

      <Button title="Reset Steps" onPress={resetMotion} />
    </View>
  );
}