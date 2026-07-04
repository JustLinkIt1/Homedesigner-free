import { useEffect, useState } from 'react';
import { Home, Plus, Ruler, FolderOpen, Copy, Trash2, Pencil, Sofa, ChevronRight } from 'lucide-react';
import { useDesign } from '../store/designStore';
import { confirmDialog, toast } from '../lib/ui';
import { openProjectFile } from '../lib/projectIO';
import { requirePro } from '../lib/pro';
import { APP_NAME, APP_TAGLINE } from '../lib/appInfo';
import * as projects from '../lib/projects';

function timeAgo(ts: number): string {
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * The app's home: every saved design as a card, plus the first-run actions
 * (sample / import / blank). Replaces the old one-shot WelcomeModal.
 */
export default function ProjectsScreen({
  onOpenEditor,
  onImport,
}: {
  onOpenEditor: () => void;
  onImport: () => void;
}) {
  const s = useDesign();
  const [list, setList] = useState<projects.ProjectMeta[]>(() => projects.listProjects());
  const [renaming, setRenaming] = useState<string | null>(null);
  const refresh = () => setList(projects.listProjects());
  useEffect(refresh, []);

  const openProject = (id: string) => {
    const snap = projects.readProject(id);
    if (!snap) {
      toast.error("Couldn't open that project — its data is missing.");
      return;
    }
    projects.setActiveId(id);
    s.loadSnapshot(snap as never);
    onOpenEditor();
  };

  const newProject = (then?: () => void) => {
    // Second-and-later projects are the Pro 'projects' feature.
    if (list.length >= 1 && !requirePro('projects')) return;
    projects.createProject();
    s.newProject();
    onOpenEditor();
    then?.();
  };

  return (
    <div className="projects-screen">
      <header className="ps-head">
        <div className="brand">
          <div className="brand-mark">
            <Home className="icon" />
          </div>
          <div className="brand-name">
            {APP_NAME}
            <span className="sub">{APP_TAGLINE}</span>
          </div>
        </div>
      </header>

      <main className="ps-main">
        {list.length === 0 ? (
          <section className="ps-welcome">
            <h1>Design your dream home</h1>
            <p>Draw floor plans in 2D, furnish every room, and walk through it in 3D.</p>
            <div className="welcome-cards">
              <button
                className="welcome-card primary"
                onClick={() => {
                  projects.createProject('Sample apartment');
                  s.loadSample();
                  onOpenEditor();
                }}
              >
                <span className="wc-ico"><Sofa className="icon" /></span>
                <span className="wc-title">Open the sample home</span>
                <span className="wc-sub">A furnished 2-bed apartment to explore</span>
              </button>
              <button
                className="welcome-card"
                onClick={() => {
                  projects.createProject('Imported plan');
                  s.newProject();
                  onOpenEditor();
                  onImport();
                }}
              >
                <span className="wc-ico"><Ruler className="icon" /></span>
                <span className="wc-title">Import a 2D plan</span>
                <span className="wc-sub">PDF / image / DXF — walls traced automatically</span>
              </button>
              <button className="welcome-card" onClick={() => newProject()}>
                <span className="wc-ico"><Plus className="icon" /></span>
                <span className="wc-title">Start from scratch</span>
                <span className="wc-sub">Draw walls and rooms yourself</span>
              </button>
            </div>
          </section>
        ) : (
          <>
            <div className="ps-toolbar">
              <h1>Your projects</h1>
              <div className="ps-actions">
                <button
                  className="btn"
                  onClick={async () => {
                    const snap = await openProjectFile();
                    if (snap) {
                      projects.createProject(snap.projectName || 'Imported home');
                      s.loadSnapshot(snap);
                      onOpenEditor();
                    }
                  }}
                >
                  <FolderOpen className="icon" /> Open .json
                </button>
                <button className="btn primary" onClick={() => newProject()}>
                  <Plus className="icon" /> New project
                </button>
              </div>
            </div>
            <div className="ps-grid">
              {list.map((p) => (
                <div key={p.id} className="ps-card">
                  <button className="ps-thumb" onClick={() => openProject(p.id)} aria-label={`Open ${p.name}`}>
                    {p.thumbnail ? (
                      <img src={p.thumbnail} alt="" />
                    ) : (
                      <span className="ps-thumb-empty">
                        <Home className="icon" />
                      </span>
                    )}
                    <span className="ps-open">
                      Open <ChevronRight className="icon" />
                    </span>
                  </button>
                  <div className="ps-meta">
                    {renaming === p.id ? (
                      <input
                        className="ps-rename"
                        defaultValue={p.name}
                        autoFocus
                        onBlur={(e) => {
                          projects.renameProject(p.id, e.target.value.trim() || p.name);
                          setRenaming(null);
                          refresh();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                      />
                    ) : (
                      <span className="ps-name" title={p.name}>{p.name}</span>
                    )}
                    <span className="ps-date">{timeAgo(p.updatedAt)}</span>
                  </div>
                  <div className="ps-card-actions">
                    <button title="Rename" aria-label={`Rename ${p.name}`} onClick={() => setRenaming(p.id)}>
                      <Pencil className="icon" />
                    </button>
                    <button
                      title="Duplicate"
                      aria-label={`Duplicate ${p.name}`}
                      onClick={() => {
                        if (!requirePro('projects')) return;
                        const id = projects.duplicateProject(p.id);
                        if (id) {
                          refresh();
                          toast.success('Project duplicated');
                        }
                      }}
                    >
                      <Copy className="icon" />
                    </button>
                    <button
                      title="Delete"
                      aria-label={`Delete ${p.name}`}
                      className="danger"
                      onClick={async () => {
                        const ok = await confirmDialog(
                          `Delete “${p.name}”?`,
                          'This permanently removes the project from this device.',
                          { confirmLabel: 'Delete', danger: true },
                        );
                        if (ok) {
                          projects.deleteProject(p.id);
                          refresh();
                          toast.info('Project deleted');
                        }
                      }}
                    >
                      <Trash2 className="icon" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
