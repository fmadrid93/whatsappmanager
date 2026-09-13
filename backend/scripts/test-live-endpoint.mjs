async function run() {
  const phone = "+59172620787";
  const sessionName = `sesion_diag_${Date.now()}`;
  console.log(`[TEST] Solicitando pairing code para ${sessionName} con telefono ${phone}...`);
  
  const res = await fetch(`http://127.0.0.1:3000/api/sessions/${sessionName}/pairing-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });

  const json = await res.json();
  console.log(`[TEST] Status: ${res.status}`);
  console.log(`[TEST] Response:`, json);
}

run().catch(console.error);
