import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import { addIcons } from 'ionicons';
import {
  bookOutline,
  checkmarkCircleOutline,
  chevronDownOutline,
  chevronForwardOutline,
  copyOutline,
  documentTextOutline,
  folderOutline,
  searchOutline,
  sparklesOutline,
} from 'ionicons/icons';
import {
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

export interface VaultEntry {
  name: string;
  type: 'file' | 'dir';
  size_bytes: number;
  mtime_ms?: number;
}

export interface VaultSearchResult {
  title: string;
  path: string;
  excerpt: string;
  modified: string;
}

/** Sentinel value for the virtual "Flint Vault" root entry. */
const ROOT = '.';

/** Shown when the dynamic folder list fails to load. */
const FALLBACK_FOLDERS = ['Sessions', 'Projects', 'Inbox', 'Knowledge', 'Threads'];

@Component({
  selector: 'app-vault',
  templateUrl: './vault.page.html',
  styleUrls: ['./vault.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonButtons,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonMenuButton,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class VaultPage implements OnInit {
  readonly ROOT = ROOT;

  readonly activeSegment = signal<'browse' | 'search'>('browse');
  /** Which accordion folder is currently open (null = all collapsed). */
  readonly expandedFolder = signal<string | null>('Threads');
  /** Sort order for the folder list. */
  readonly folderSort = signal<'recent' | 'alpha'>('recent');
  /** Raw folder data with mtime for sorting — not exposed to template. */
  private readonly rawFolders = signal<{ name: string; mtime_ms: number }[]>([]);
  /** Sorted folder names — auto-recomputes when sort order or data changes. */
  readonly sortedFolders = computed(() => {
    const raw = this.rawFolders();
    const sort = this.folderSort();
    if (!raw.length) return FALLBACK_FOLDERS;
    return [...raw]
      .sort((a, b) =>
        sort === 'alpha' ? a.name.localeCompare(b.name) : b.mtime_ms - a.mtime_ms,
      )
      .map((f) => f.name);
  });
  /** Cached file list per folder key (ROOT or folder name). */
  readonly folderFilesMap = signal<Record<string, VaultEntry[]>>({});
  /** Which folder is currently loading its file list. */
  readonly loadingFolder = signal<string | null>(null);
  /** Currently open file path (for highlight). */
  readonly activeFile = signal<string | null>(null);
  /** Markdown content in the reading pane. */
  readonly markdown = signal<string | null>(null);

  readonly searchQuery = signal<string>('');
  readonly searchResults = signal<VaultSearchResult[]>([]);
  readonly isLoadingFolders = signal(false);
  readonly isLoadingFile = signal(false);
  readonly isLoadingSearch = signal(false);
  readonly isProcessingThread = signal(false);
  readonly processThreadResult = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly renderedHtml = computed<SafeHtml | null>(() => {
    const md = this.markdown();
    if (!md) return null;
    const html = marked.parse(md, { async: false }) as string;
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });

  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);

  constructor() {
    addIcons({
      bookOutline,
      checkmarkCircleOutline,
      chevronDownOutline,
      chevronForwardOutline,
      copyOutline,
      documentTextOutline,
      folderOutline,
      searchOutline,
      sparklesOutline,
    });
  }

  ngOnInit(): void {
    // 1. Load dynamic folder list from vault root
    this.isLoadingFolders.set(true);
    this.http
      .get<{ folder: string; entries: VaultEntry[] }>('/api/vault/browse', {
        params: new HttpParams().set('folder', ROOT),
      })
      .subscribe({
        next: ({ entries }) => {
          const dirs = entries
            .filter((e) => e.type === 'dir' && !e.name.startsWith('.') && !e.name.startsWith('_'))
            .map((e) => ({ name: e.name, mtime_ms: e.mtime_ms ?? 0 }));
          this.rawFolders.set(
            dirs.length ? dirs : FALLBACK_FOLDERS.map((n) => ({ name: n, mtime_ms: 0 })),
          );
          this.isLoadingFolders.set(false);
        },
        error: () => {
          this.rawFolders.set(FALLBACK_FOLDERS.map((n) => ({ name: n, mtime_ms: 0 })));
          this.isLoadingFolders.set(false);
        },
      });

    // 2. Load README.md into the reading pane by default (independent of file list)
    this.openFile('README.md');

    // 3. Auto-expand Threads on load
    this.loadFolderFiles('Threads');
  }

  onSegmentChange(ev: CustomEvent): void {
    this.activeSegment.set((ev as CustomEvent<{ value: 'browse' | 'search' }>).detail.value);
  }

  setFolderSort(sort: 'recent' | 'alpha'): void {
    this.folderSort.set(sort);
  }

  /** Toggle accordion open/closed.  Loads file list lazily on first expand. */
  toggleFolder(folder: string): void {
    if (this.expandedFolder() === folder) {
      this.expandedFolder.set(null);
      return;
    }
    this.expandedFolder.set(folder);
    if (!this.folderFilesMap()[folder]) {
      this.loadFolderFiles(folder);
    }
  }

  /** Returns the cached file list for a folder (empty array until loaded). */
  filesForFolder(folder: string): VaultEntry[] {
    return this.folderFilesMap()[folder] ?? [];
  }

  /** Returns the vault-relative file path for a given folder + filename. */
  filePathFor(folder: string, name: string): string {
    return folder === ROOT ? name : `${folder}/${name}`;
  }

  /** Copy the active file path to the clipboard. */
  copyPath(): void {
    const p = this.activeFile();
    if (p) navigator.clipboard.writeText(p).catch(() => {});
  }

  /** True when the open file is a Threads/ note with 'untitled' in its name. */
  isUntitledThread(): boolean {
    const p = this.activeFile();
    return !!p && p.toLowerCase().startsWith('threads/') && p.toLowerCase().includes('untitled');
  }

  /** Call backend to generate title+frontmatter for an untitled thread, then reload. */
  processThread(): void {
    const filePath = this.activeFile();
    if (!filePath || this.isProcessingThread()) return;
    this.isProcessingThread.set(true);
    this.processThreadResult.set(null);
    this.http
      .post<{ old_path: string; new_path: string; title: string }>('/api/vault/process-thread', { path: filePath })
      .subscribe({
        next: ({ new_path, title }) => {
          this.isProcessingThread.set(false);
          this.processThreadResult.set(`✓ Renamed to “${title}”`);
          // Invalidate the Threads folder cache so it reloads fresh
          this.folderFilesMap.update((m) => { const n = { ...m }; delete n['Threads']; return n; });
          // Open the newly renamed file
          this.openFile(new_path);
        },
        error: (err) => {
          this.isProcessingThread.set(false);
          this.error.set(String(err?.error?.error ?? err?.message ?? 'Process thread failed'));
        },
      });
  }

  openFile(filePath: string): void {
    this.activeFile.set(filePath);
    this.markdown.set(null);
    this.isLoadingFile.set(true);
    this.error.set(null);
    this.http
      .get<{ path: string; markdown: string }>('/api/vault/file', {
        params: new HttpParams().set('path', filePath),
      })
      .subscribe({
        next: ({ markdown }) => {
          this.markdown.set(markdown);
          this.isLoadingFile.set(false);
        },
        error: (err) => {
          this.error.set(String(err?.error?.error ?? err?.message ?? 'Failed to load file'));
          this.isLoadingFile.set(false);
        },
      });
  }

  onSearchInput(ev: CustomEvent): void {
    const query = String((ev as CustomEvent<{ value: string }>).detail.value ?? '').trim();
    this.searchQuery.set(query);
    if (!query) {
      this.searchResults.set([]);
      return;
    }
    this.runSearch(query);
  }

  private loadFolderFiles(folder: string): void {
    this.loadingFolder.set(folder);
    this.http
      .get<{ folder: string; entries: VaultEntry[] }>('/api/vault/browse', {
        params: new HttpParams().set('folder', folder),
      })
      .subscribe({
        next: ({ entries }) => {
          const files = entries.filter((e) => e.type === 'file' && e.name.endsWith('.md'));
          this.folderFilesMap.update((m) => ({ ...m, [folder]: files }));
          this.loadingFolder.set(null);
        },
        error: (err) => {
          this.error.set(String(err?.error?.error ?? err?.message ?? 'Failed to load folder'));
          this.loadingFolder.set(null);
        },
      });
  }

  private runSearch(query: string): void {
    this.isLoadingSearch.set(true);
    this.error.set(null);
    this.http
      .get<{ results: VaultSearchResult[] }>('/api/vault/search', {
        params: new HttpParams().set('q', query).set('limit', '10'),
      })
      .subscribe({
        next: ({ results }) => {
          this.searchResults.set(results);
          this.isLoadingSearch.set(false);
        },
        error: (err) => {
          this.error.set(String(err?.error?.error ?? err?.message ?? 'Search failed'));
          this.isLoadingSearch.set(false);
        },
      });
  }
}

