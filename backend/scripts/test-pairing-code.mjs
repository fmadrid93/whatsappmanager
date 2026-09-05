import http from "node:http";

const phone = process.argv[2] || "+595986125168";
const session = process.argv[3] || "asuncion_gerente_fmadridgerente_linea2";
const data = JSON.stringify({ phone });

const req = http.request(
  {
    hostname: "127.0.0.1",
    port: 3000,
    path: `/sessions/${session}/pairing-code`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
    },
  },
  (res) => {
    let body = "";
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => {
      console.log(`STATUS: ${res.statusCode}`);
      console.log(`BODY: ${body}`);
    });
  }
);

req.on("error", (e) => console.error(e));
req.write(data);
req.end();
