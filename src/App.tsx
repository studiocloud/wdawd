import React, { useState } from 'react';
import { Mail, Upload, Download, Loader } from 'lucide-react';

interface ValidationResult {
  email: string;
  valid: boolean;
  checks: {
    mx: boolean;
    dns: boolean;
    spf: boolean;
    mailbox: boolean;
    smtp: boolean;
  };
  reason?: string;
}

export function App() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ValidationResult[]>([]);

  const validateEmail = async (email: string) => {
    try {
      setIsLoading(true);
      const response = await fetch('http://localhost:3000/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = await response.json();
      setResults([result]);
    } catch (error) {
      console.error('Validation error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFile(file);
    }
  };

  const validateBulk = async () => {
    if (!file) return;

    try {
      setIsLoading(true);
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('http://localhost:3000/api/validate/bulk', {
        method: 'POST',
        body: formData,
      });

      const reader = response.body?.getReader();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const data = JSON.parse(chunk);
        
        if (data.progress) {
          setProgress(data.progress);
        }
        if (data.results) {
          setResults(prev => [...prev, ...data.results]);
        }
      }
    } catch (error) {
      console.error('Bulk validation error:', error);
    } finally {
      setIsLoading(false);
      setProgress(0);
    }
  };

  const downloadResults = () => {
    const csv = [
      ['Email', 'Valid', 'MX', 'DNS', 'SPF', 'Mailbox', 'SMTP', 'Reason'],
      ...results.map(r => [
        r.email,
        r.valid.toString(),
        r.checks.mx.toString(),
        r.checks.dns.toString(),
        r.checks.spf.toString(),
        r.checks.mailbox.toString(),
        r.checks.smtp.toString(),
        r.reason || ''
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'validation-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="text-center mb-12">
          <Mail className="w-12 h-12 text-blue-600 mx-auto mb-4" />
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Email Validator Pro</h1>
          <p className="text-gray-600">Deep verification with MX, DNS, SPF, Mailbox, and SMTP checks</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setIsBulkMode(false)}
              className={`flex-1 py-2 px-4 rounded-lg ${!isBulkMode ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              Single Email
            </button>
            <button
              onClick={() => setIsBulkMode(true)}
              className={`flex-1 py-2 px-4 rounded-lg ${isBulkMode ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              Bulk Validation
            </button>
          </div>

          {!isBulkMode ? (
            <div className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email address"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={() => validateEmail(email)}
                disabled={isLoading || !email}
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader className="w-5 h-5 animate-spin mx-auto" />
                ) : (
                  'Validate Email'
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="flex flex-col items-center cursor-pointer"
                >
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <span className="text-gray-600">Upload CSV file (max 25,000 rows)</span>
                </label>
              </div>
              {file && (
                <div className="text-sm text-gray-600">
                  Selected file: {file.name}
                </div>
              )}
              <button
                onClick={validateBulk}
                disabled={isLoading || !file}
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader className="w-5 h-5 animate-spin" />
                    <span>{Math.round(progress)}%</span>
                  </div>
                ) : (
                  'Validate Emails'
                )}
              </button>
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Results</h2>
              {isBulkMode && (
                <button
                  onClick={downloadResults}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Download className="w-4 h-4" />
                  Download CSV
                </button>
              )}
            </div>
            <div className="space-y-4">
              {results.map((result, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg ${
                    result.valid ? 'bg-green-50' : 'bg-red-50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{result.email}</p>
                      <p className={`text-sm ${
                        result.valid ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {result.valid ? 'Valid' : result.reason}
                      </p>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {Object.entries(result.checks).map(([key, value]) => (
                        <div
                          key={key}
                          className={`text-xs px-2 py-1 rounded ${
                            value ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                          }`}
                        >
                          {key.toUpperCase()}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;