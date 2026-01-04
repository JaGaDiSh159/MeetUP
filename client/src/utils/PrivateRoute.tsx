import { Navigate, Outlet, useLocation } from "react-router-dom";

function PrivateRoute() {
  const user = localStorage.getItem("user");
  const location = useLocation();

  if (!user) {
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  }

  return <Outlet />;
}

export default PrivateRoute;
