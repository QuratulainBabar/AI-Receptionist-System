import "dotenv/config";

async function main() {
  const res = await fetch("http://localhost:4000/api/webhooks/synthflow/actions/availability", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: "today" }),
  });
  const json = await res.json();
  console.log(JSON.stringify({ status: res.status, body: json }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
