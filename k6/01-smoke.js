// SMOKE TEST
//
// Question it answers: does the system work at all?
//
// One virtual user for 30 seconds. The cheapest test you own: run it after
// every deploy, and always before any heavier test.
//
//   make smoke

import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3333";

export const options = {
  // The load profile: 1 user, looping for 30 seconds.
  vus: 1,
  duration: "30s",

  // Thresholds are the pass/fail criteria. Strict on purpose: at this load
  // nothing is allowed to fail.
  thresholds: {
    http_req_failed: ["rate==0"], // no request may fail
    checks: ["rate==1"], // every check must pass
    http_req_duration: ["p(95)<1000"], // generous: we only prove it responds
  },
};

// What one virtual user does, over and over.
export default function () {
  const res = http.post(
    `${BASE_URL}/api/pizza`,
    JSON.stringify({ excludedIngredients: ["Pepperoni"] }),
    {
      headers: {
        "Content-Type": "application/json",
        // Any 16-character token works in QuickPizza.
        Authorization: "token abcdef0123456789",
      },
    },
  );

  // A check records pass/fail. It does NOT stop the test on its own - the
  // `checks` threshold above is what turns checks into a verdict.
  check(res, {
    "status is 200": (r) => r.status === 200,
    // A business rule, not just a status code: we asked for no Pepperoni.
    "no Pepperoni": (r) =>
      r.status === 200 &&
      r.json().pizza.ingredients.every((i) => i.name !== "Pepperoni"),
  });

  sleep(1); // a real user pauses between actions
}
