import { useRef, useState, type ChangeEvent } from 'react';
import { LuCalculator, LuFileSpreadsheet, LuLayoutList, LuTable, LuTriangleAlert, LuUpload } from 'react-icons/lu';
import type { ParsedFile } from './lib/types';
import { decodeBuffer, parseBom } from './lib/parse';
import { calculate, type CalcResult } from './lib/calc';
import { SourceView } from './components/SourceView';
import { CalcView } from './components/CalcView';
import { SectionsView } from './components/SectionsView';

type View = 'source' | 'calc' | 'sections';

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [view, setView] = useState<View>('source');
  const [calc, setCalc] = useState<CalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadId, setLoadId] = useState(0);

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = ''; // чтобы тот же файл можно было выбрать повторно
    if (!picked) return;
    try {
      const { text, encoding } = decodeBuffer(await picked.arrayBuffer());
      const parsed = parseBom(text, picked.name, encoding);
      setFile(parsed);
      setLoadId((n) => n + 1);
      setCalc(null);
      setView('source');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось прочитать файл.');
    }
  };

  const runCalc = () => {
    if (!file) return;
    setCalc(calculate(file));
    setView('calc');
  };

  return (
    <div className="app">
      <header className="topbar">
        <LuFileSpreadsheet aria-hidden className="topbar-icon" />
        <div>
          <h1>Спецификация: разбор и расчёт</h1>
          <p className="muted">Выберите файл спецификации — таблица, расчёт материалов и участки появятся ниже.</p>
        </div>
      </header>

      <main className="content">
        <section className="panel file-panel">
          <input
            ref={inputRef}
            type="file"
            hidden
            accept=".txt,.tsv,.csv,.tab,text/plain,text/tab-separated-values,text/csv"
            onChange={onPick}
            data-testid="file-input"
          />
          <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()}>
            <LuUpload aria-hidden />
            {file ? 'Выбрать другой файл' : 'Выбрать файл'}
          </button>
          {file ? (
            <div className="file-info">
              <strong>{file.fileName}</strong>
              <span className="muted">
                {file.rows.length} строк · {file.headers.length} колонок · {file.encoding}
              </span>
            </div>
          ) : (
            <span className="muted">Поддерживаются текстовые файлы с разделителями табуляции (.txt, .tsv), также .csv.</span>
          )}
        </section>

        {error && (
          <div className="alert alert-error" role="alert">
            <LuTriangleAlert aria-hidden />
            <div>{error}</div>
          </div>
        )}

        {file && (
          <>
            <nav className="actions" aria-label="Режимы просмотра">
              <button
                type="button"
                className={'btn ' + (view === 'source' ? 'btn-primary' : 'btn-outline')}
                onClick={() => setView('source')}
              >
                <LuTable aria-hidden /> Исходная таблица
              </button>
              <button
                type="button"
                className={'btn ' + (view === 'calc' ? 'btn-primary' : 'btn-outline')}
                onClick={runCalc}
              >
                <LuCalculator aria-hidden /> Рассчитать
              </button>
              <button
                type="button"
                className={'btn ' + (view === 'sections' ? 'btn-primary' : 'btn-outline')}
                onClick={() => setView('sections')}
              >
                <LuLayoutList aria-hidden /> Посмотреть участки
              </button>
            </nav>

            {view === 'source' && <SourceView key={loadId} file={file} />}
            {view === 'calc' && calc && <CalcView result={calc} />}
            {view === 'sections' && <SectionsView key={loadId} file={file} />}
          </>
        )}
      </main>
    </div>
  );
}
