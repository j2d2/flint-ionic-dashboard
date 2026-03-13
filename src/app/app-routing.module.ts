import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
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
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
