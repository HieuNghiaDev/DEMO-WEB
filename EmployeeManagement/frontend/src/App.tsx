import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import ProtectedRoute from "./components/auth/ProtectedRoute";
import MainLayout from "./layouts/MainLayout";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";

import Login from "./pages/Login";
import EmployeeRoom from "./pages/EmployeeRoom";
import OrganizationDesign from "./pages/OrganizationDesign";
import BusinessQuest from "./pages/BusinessQuest";
import VisaProgress from "./pages/VisaProgress";
import AIEmployees from "./pages/AI";
import ApprovalRoom from "./pages/ApprovalRoom";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AuthProvider>
          <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
              <Route path="/" element={<EmployeeRoom />} />
              <Route
                path="/organization"
                element={<OrganizationDesign />}
              />
              <Route path="/quests" element={<BusinessQuest />} />
              <Route path="/visa-progress" element={<VisaProgress />} />
              <Route path="/ai" element={<AIEmployees />} />
              <Route path="/approvals" element={<ApprovalRoom />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
