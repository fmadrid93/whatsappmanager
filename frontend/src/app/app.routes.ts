import type { Routes } from "@angular/router";
import { authGuard } from "./core/auth.guard";
import { LoginComponent } from "./pages/login.component";
import { DashboardComponent } from "./pages/dashboard.component";
import { SessionsComponent } from "./pages/sessions.component";
import { CampaignsComponent } from "./pages/campaigns.component";
import { FlowsComponent } from "./pages/flows.component";
import { ConversationsComponent } from "./pages/conversations.component";
import { AuditComponent } from "./pages/audit.component";
import { IntegrationsComponent } from "./pages/integrations.component";

export const routes: Routes = [
  { path: "login", component: LoginComponent },
  { path: "", component: DashboardComponent, canActivate: [authGuard] },
  { path: "sessions", component: SessionsComponent, canActivate: [authGuard] },
  { path: "campaigns", component: CampaignsComponent, canActivate: [authGuard] },
  { path: "flows", component: FlowsComponent, canActivate: [authGuard] },
  { path: "conversations", component: ConversationsComponent, canActivate: [authGuard] },
  { path: "audit", component: AuditComponent, canActivate: [authGuard] },
  { path: "integrations", component: IntegrationsComponent, canActivate: [authGuard] },
  { path: "**", redirectTo: "" },
];
