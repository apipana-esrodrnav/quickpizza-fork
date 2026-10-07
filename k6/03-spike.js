// SPIKE TEST
//
// Question it answers: what happens when traffic suddenly jumps far above
// normal - and does the system recover afterwards?
//
// The user is exactly the same as in the load test. Only the load profile and
// the thresholds change. That is the whole idea: a test type is a shape of
// traffic plus the targets you attach to it, not a different script.
//
//   make spike
//   make spike K6_FLAGS="-o experimental-prometheus-rw"   # watch it in Grafana

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3333";

// A custom metric. k6 measures time and errors for free; anything about your
// own domain you measure yourself. A Trend gives you percentiles.
const pizzaCalories = new Trend("pizza_calories");

export const options = {
  // The load profile: normal traffic, a sudden 20x jump, back to normal.
  stages: [
    { duration: "30s", target: 5 }, // baseline: normal traffic
    { duration: "10s", target: 100 }, // the spike
    { duration: "30s", target: 100 }, // hold the peak
    { duration: "10s", target: 5 }, // drop back
    { duration: "30s", target: 5 }, // recovery <- compare with the baseline
  ],

  // Looser than the load test: slowing down under a 20x spike is acceptable,
  // falling over is not.
  thresholds: {
    http_req_failed: ["rate<0.05"], // under 5% errors
    http_req_duration: ["p(95)<2000"], // 4x the load-test budget
    checks: ["rate>0.95"],
    pizza_calories: ["p(99)<=500"],
  },
};

export default function () {
  const headers = {
    "Content-Type": "application/json",
    Authorization: "token abcdef0123456789",
  };
  // Only used by `make fail`: asks QuickPizza to slow itself down.
  if (__ENV.DELAY) headers["x-delay-get-ingredients"] = __ENV.DELAY;

  const res = http.post(
    `${BASE_URL}/api/pizza`,
    JSON.stringify({
      maxCaloriesPerSlice: 500,
      excludedIngredients: ["Pepperoni"],
    }),
    { headers },
  );

  check(res, {
    "status is 200": (r) => r.status === 200,
    "no Pepperoni": (r) =>
      r.status === 200 &&
      r.json().pizza.ingredients.every((i) => i.name !== "Pepperoni"),
  });

  if (res.status === 200) {
    pizzaCalories.add(res.json().calories);
  }

  sleep(1);
}
