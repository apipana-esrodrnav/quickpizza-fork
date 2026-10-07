// LOAD TEST
//
// Question it answers: does the system meet its targets under the traffic we
// expect on a normal day?
//
// Same user as the smoke test. What changes is the load profile (ramp up to
// 10 users, hold, ramp down) and the thresholds, which are now real targets.
//
//   make load
//   make load K6_FLAGS="-o experimental-prometheus-rw"   # watch it in Grafana

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3333";

// A custom metric. k6 measures time and errors for free; anything about your
// own domain you measure yourself. A Trend gives you percentiles.
const pizzaCalories = new Trend("pizza_calories");

export const options = {
  // The load profile: ramp up, hold steady, ramp down.
  stages: [
    { duration: "30s", target: 10 }, // ramp up to 10 users
    { duration: "1m", target: 10 }, // steady state <- what we judge
    { duration: "30s", target: 0 }, // ramp down
  ],

  // The targets. If one is missed, k6 exits with code 99 and CI fails.
  thresholds: {
    http_req_failed: ["rate<0.01"], // under 1% errors
    // Percentiles, never the average: the average hides the slow requests.
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    checks: ["rate>0.99"], // over 99% of checks pass
    pizza_calories: ["p(99)<=500"], // a target on our own domain metric
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
