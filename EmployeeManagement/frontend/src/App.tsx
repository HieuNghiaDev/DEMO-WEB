import {
  Navigate,
  Route,
  Routes,
} from 'react-router-dom'

import MainLayout from './layouts/MainLayout'
import EmployeeRoom from './pages/EmployeeRoom'
import OrganizationDesign from './pages/OrganizationDesign'
import BusinessQuest from './pages/BusinessQuest'
import ManualWorkshop from './pages/ManualWorkshop'
import AIEmployees from './pages/AI'
import ApprovalRoom from './pages/ApprovalRoom'

function App() {
  return (
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<EmployeeRoom />} />

          <Route
            path="/organization"
            element={<OrganizationDesign />}
          />

          <Route
            path="/quests"
            element={<BusinessQuest />}
          />

          <Route
            path="/manual"
            element={<ManualWorkshop />}
          />

          <Route
            path="/ai"
            element={<AIEmployees />}
          />

          <Route
            path="/approvals"
            element={<ApprovalRoom />}
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
  )
}

export default App
