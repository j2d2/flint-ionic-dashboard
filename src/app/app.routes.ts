import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./login/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: 'home',
        loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'agent-tasks',
        loadComponent: () => import('./agent-tasks/agent-tasks.page').then((m) => m.AgentTasksPage),
      },
      {
        path: 'thread-ingest',
        loadComponent: () => import('./thread-ingest/thread-ingest.page').then((m) => m.ThreadIngestPage),
      },
      {
        path: 'chat',
        loadComponent: () => import('./chat/chat.page').then((m) => m.ChatPage),
      },
      {
        path: 'task/:id',
        loadComponent: () => import('./task-detail/task-detail.page').then((m) => m.TaskDetailPage),
      },
      {
        path: 'new-thread',
        loadComponent: () => import('./new-thread/new-thread-modal.component').then((m) => m.NewThreadModalComponent),
      },
      {
        path: 'haiku-leaderboard',
        loadComponent: () => import('./haiku-leaderboard/haiku-leaderboard.page').then((m) => m.HaikuLeaderboardPage),
      },
      {
        path: 'youtube-agent',
        loadComponent: () => import('./youtube-agent/youtube-agent.page').then((m) => m.YoutubeAgentPage),
      },
      {
        path: 'inbox',
        loadComponent: () => import('./inbox/inbox.page').then((m) => m.InboxPage),
      },
      {
        path: 'vault',
        loadComponent: () => import('./vault/vault.page').then((m) => m.VaultPage),
      },
      {
        path: 'thread-builder',
        loadComponent: () => import('./thread-builder/thread-builder.page').then((m) => m.ThreadBuilderPage),
      },
      {
        path: 'daemon',
        loadComponent: () => import('./daemon/daemon.page').then((m) => m.DaemonPage),
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
    ],
  },
];
