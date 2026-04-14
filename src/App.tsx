import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

function App() {
  const [status, setStatus] = useState("idle");
  const testUrl = "https://ice5.somafm.com/groovesalad-128-mp3";

  const handleRecord = async () => {
    setStatus("recording...");
    try {
      const result = await invoke("start_test_recording", { url: testUrl });
      setStatus(String(result));
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-200">
      <h1 className="text-2xl font-bold">Tapir — Walking Skeleton</h1>
      <p className="text-slate-400">URL: {testUrl}</p>
      <button
        onClick={handleRecord}
        className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
      >
        Start Test Recording
      </button>
      <p className="text-sm text-slate-400">Status: {status}</p>
    </div>
  );
}

export default App;
