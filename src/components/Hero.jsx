import { useEffect, useState, useRef } from "react";
import { FileText } from "lucide-react";

export default function Hero() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [documents, setDocuments] = useState([]);
  const [activeDoc, setActiveDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Mouse tracking
  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Load documents from backend and normalize shape
  useEffect(() => {
    async function loadDocs() {
      try {
        const res = await fetch("http://localhost:3001/documents");
        // defend: maybe not JSON
        const json = await res.json();
        const normalized = Array.isArray(json)
          ? json.map((doc) => normalizeDocFromBackend(doc))
          : [];
        setDocuments((prev) => [...normalized, ...prev]);
      } catch (err) {
        console.error("Error loading documents:", err);
      }
    }
    loadDocs();
  }, []);

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  /** ------------------------------
   * Helpers
   * ------------------------------ */
  const normalizeDocFromBackend = (doc) => {
    // Accept multiple possible shapes from your backend
    const topics = Array.isArray(doc.topics)
      ? doc.topics
      : Array.isArray(doc.key_topics)
      ? doc.key_topics
      : [];
    const docType = doc.docType ?? doc.document_type ?? "";
    const tokens = doc.tokens ?? null;
    return {
      id: doc.id ?? null,
      name: doc.name ?? doc.filename ?? "Untitled",
      timestamp: doc.timestamp ?? new Date().toLocaleString(),
      status: doc.status ?? "Complete",
      summary: typeof doc.summary === "string" ? doc.summary : null,
      topics,
      docType,
      tokens,
      file: doc.file ?? null,
      // keep any raw data for debugging if needed:
      __raw: doc,
    };
  };

  // Immutable update utility: returns new array with index replaced
  const replaceAt = (arr, index, newItem) => {
    return [...arr.slice(0, index), newItem, ...arr.slice(index + 1)];
  };

  /** ------------------------------
   * Add uploaded files
   * ------------------------------ */
  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    const newDocs = selectedFiles.map((file) => ({
      id: null,
      file,
      name: file.name,
      timestamp: new Date().toLocaleString(),
      status: "Pending",
      summary: null,
      topics: [],
      docType: "",
      tokens: null,
    }));
    setDocuments((prev) => [...prev, ...newDocs]);
    // reset input so same file can be re-picked if needed
    e.target.value = "";
  };

  /** ------------------------------
   * Analyze a SINGLE document
   * ------------------------------ */
  const analyzeSingleFile = async (index) => {
    // defensive checks
    if (index == null || index < 0 || index >= documents.length) return;
    const target = documents[index];
    if (!target.file) return;

    // clone doc and mark processing immutably
    const updatedDoc = { ...target, status: "Processing" };
    setDocuments((prev) => replaceAt(prev, index, updatedDoc));
    // if this is the active doc, update it too
    if (activeDoc && activeDoc === target) {
      setActiveDoc(updatedDoc);
    }

    const formData = new FormData();
    formData.append("file", target.file);

    try {
      const res = await fetch("http://localhost:3001/analyze", {
        method: "POST",
        body: formData,
      });

      // Defensive: try to parse JSON, but backend might return HTML or non-JSON
      let json = null;
      try {
        json = await res.json();
      } catch (parseErr) {
        // fallback: attempt to read as text and log
        const text = await res.text();
        console.error("Non-JSON response from /analyze:", text);
        throw new Error("Server returned non-JSON response");
      }

      // If server returned an error status with JSON { error: ... }
      if (!res.ok) {
        console.error("Analyze API error:", json);
        const failedDoc = {
          ...target,
          status: "Failed",
          summary: json?.error ?? "Analysis failed",
        };
        setDocuments((prev) => replaceAt(prev, index, failedDoc));
        if (activeDoc && activeDoc === target) setActiveDoc(failedDoc);
        return;
      }

      // Normalize backend response (accept both summary/key_topics/document_type and alternative keys)
      const summary = typeof json.summary === "string" ? json.summary : null;
      const topics = Array.isArray(json.topics)
        ? json.topics
        : Array.isArray(json.key_topics)
        ? json.key_topics
        : [];
      const docType = json.docType ?? json.document_type ?? "";
      const tokens = json.tokens ?? null;
      const returnedId = json.id ?? null;

      const completeDoc = {
        ...target,
        id: returnedId,
        status: "Complete",
        summary,
        topics,
        docType,
        tokens,
      };

      setDocuments((prev) => replaceAt(prev, index, completeDoc));
      if (activeDoc && activeDoc === target) setActiveDoc(completeDoc);
    } catch (err) {
      console.error("Error analyzing file:", err);
      const failedDoc = {
        ...target,
        status: "Failed",
        summary: "Error analyzing file.",
      };
      setDocuments((prev) => replaceAt(prev, index, failedDoc));
      if (activeDoc && activeDoc === target) setActiveDoc(failedDoc);
    }
  };

  /** ------------------------------
   * Render
   * ------------------------------ */
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center pt-16 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(59,130,246,0.15), transparent 40%)`,
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full max-w-6xl">
        {/* LEFT PANEL */}
        <div>
          <div className="relative bg-white/5 backdrop-blur-xl rounded-xl p-3 shadow-2xl border border-white/10">
            <div className="bg-gradient-to-br from-gray-900/20 to-gray-800/20 rounded-lg overflow-hidden h-[450px] border border-white/5">
              <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/10">
                <h2 className="text-white font-semibold text-lg">Document Uploader</h2>
              </div>

              <div className="flex flex-col h-full p-4 space-y-4">
                <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} className="hidden" />
                <button onClick={openFilePicker} className="px-4 py-2 bg-blue-600 text-white rounded-lg">
                  Upload Files
                </button>

                {/* DOCUMENT LIST */}
                <div className="flex-1 overflow-y-auto space-y-3 text-white text-sm border-t border-white/5 pt-3">
                  {documents.length === 0 && (
                    <div className="text-gray-400 flex flex-col items-center py-10">
                      <FileText size={48} />
                      <p className="mt-2 text-sm">Upload documents here</p>
                    </div>
                  )}

                  {documents.map((doc, i) => {
                    const isActive = activeDoc === doc;
                    const statusClass =
                      doc.status === "Pending"
                        ? "text-yellow-300"
                        : doc.status === "Processing"
                        ? "text-blue-300"
                        : doc.status === "Complete"
                        ? "text-green-300"
                        : "text-red-400";

                    return (
                      <div
                        key={i}
                        onClick={() => setActiveDoc(doc)}
                        className={`p-3 rounded-lg border border-white/10 cursor-pointer transition ${
                          isActive ? "bg-white/20" : "bg-white/10 hover:bg-white/20"
                        }`}
                      >
                        <p className="font-semibold">{doc.name}</p>
                        <p className="text-xs text-gray-300">Uploaded: {doc.timestamp}</p>
                        <p className={`text-xs mt-1 ${statusClass}`}>Status: {doc.status}</p>

                        {/* INDIVIDUAL ANALYZE BUTTON */}
                        {doc.file && doc.status !== "Processing" && doc.status !== "Complete" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              analyzeSingleFile(i);
                            }}
                            className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-xs"
                          >
                            Analyze
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="bg-white/5 backdrop-blur-xl rounded-xl p-4 border border-white/10 text-white">
          <h2 className="text-lg font-semibold mb-3">Document Analysis</h2>

          {!activeDoc && <p className="text-gray-400">Select a document to view its analysis.</p>}

          {activeDoc && (
            <div className="space-y-4">
              <h3 className="font-semibold text-xl">{activeDoc.name}</h3>
              <p className="text-sm text-gray-300">
                <strong>Uploaded:</strong> {activeDoc.timestamp}
              </p>
              <p className="text-sm text-gray-300">
                <strong>Status:</strong> {activeDoc.status}
              </p>

              {activeDoc.status === "Processing" && <p className="text-blue-300">Processing…</p>}

              {activeDoc.status === "Complete" && (
                <>
                  <div>
                    <h4 className="font-semibold mb-1">Summary</h4>
                    <p className="text-gray-200">{activeDoc.summary ?? "No summary available."}</p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-1">Key Topics</h4>
                    {Array.isArray(activeDoc.topics) && activeDoc.topics.length > 0 ? (
                      <ul className="list-disc ml-6 text-gray-200">
                        {activeDoc.topics.map((t, idx) => (
                          <li key={idx}>{t}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-gray-300 text-sm">No topics found.</p>
                    )}
                  </div>

                  <div>
                    <h4 className="font-semibold mb-1">Document Type</h4>
                    <p className="text-gray-200">{activeDoc.docType ?? "Unknown"}</p>
                  </div>

                  {activeDoc.tokens &&
                    (activeDoc.tokens.input_tokens != null ||
                      activeDoc.tokens.output_tokens != null ||
                      activeDoc.tokens.total_tokens != null) && (
                      <div>
                        <h4 className="font-semibold mb-1">Token Usage</h4>
                        <p className="text-gray-300 text-sm">
                          Prompt: {activeDoc.tokens.input_tokens ?? "N/A"}
                          <br />
                          Completion: {activeDoc.tokens.output_tokens ?? "N/A"}
                          <br />
                          Total: {activeDoc.tokens.total_tokens ?? "N/A"}
                        </p>
                      </div>
                    )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
