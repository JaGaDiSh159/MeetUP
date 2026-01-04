import { Navigate, Outlet, useLocation } from "react-router-dom";

function PrivateRoute() {
  const user = localStorage.getItem("user");
  const location = useLocation();

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <Outlet />;
}

export default PrivateRoute;
