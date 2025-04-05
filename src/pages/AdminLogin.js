import React, { useState } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Form,
  Button,
  Alert,
  Spinner,
  Badge,
} from "react-bootstrap";
import FaceDetectionComponent from "./FaceDetectionComponent";

const AdminLogin = () => {
  // Static credentials
  const ADMIN_CREDENTIALS = {
    username: "admin",
    password: "secure123!",
  };

  const SECURITY_CREDENTIALS = {
    username: "security",
    password: "monitor456!",
  };

  // State variables
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");

    // Check if account is locked
    if (isLocked) {
      setError(
        "Account locked due to multiple failed attempts. Please try again later."
      );
      return;
    }

    // Simulate loading state
    setIsLoading(true);

    // Simulate API call with timeout
    setTimeout(() => {
      // Check credentials
      if (
        username === ADMIN_CREDENTIALS.username &&
        password === ADMIN_CREDENTIALS.password
      ) {
        setIsAuthenticated(true);
        setUserRole("admin");
        // Store auth state in session storage
        sessionStorage.setItem("isAuthenticated", "true");
        sessionStorage.setItem("userRole", "admin");
      } else if (
        username === SECURITY_CREDENTIALS.username &&
        password === SECURITY_CREDENTIALS.password
      ) {
        setIsAuthenticated(true);
        setUserRole("security");
        // Store auth state in session storage
        sessionStorage.setItem("isAuthenticated", "true");
        sessionStorage.setItem("userRole", "security");
      } else {
        // Handle failed login
        const newAttempts = loginAttempts + 1;
        setLoginAttempts(newAttempts);

        // Lock account after 5 failed attempts
        if (newAttempts >= 5) {
          setIsLocked(true);
          setError(
            "Account locked due to multiple failed attempts. Please contact system administrator."
          );

          // Auto unlock after 10 minutes (in a real system, this would be handled differently)
          setTimeout(() => {
            setIsLocked(false);
            setLoginAttempts(0);
          }, 600000); // 10 minutes
        } else {
          setError(
            `Invalid username or password. Attempts remaining: ${
              5 - newAttempts
            }`
          );
        }
      }
      setIsLoading(false);
    }, 1000);
  };

  // Handle logout
  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserRole(null);
    sessionStorage.removeItem("isAuthenticated");
    sessionStorage.removeItem("userRole");
  };

  // Check for existing session on component mount
  React.useEffect(() => {
    const authStatus = sessionStorage.getItem("isAuthenticated");
    const role = sessionStorage.getItem("userRole");

    if (authStatus === "true" && role) {
      setIsAuthenticated(true);
      setUserRole(role);
    }
  }, []);

  // If authenticated, show face detection component
  if (isAuthenticated) {
    return (
      <Container fluid>
        <Row className="mb-3 mt-3">
          <Col>
            <div className="d-flex justify-content-between align-items-center">
              <h1>
                Surveillance System{" "}
                <Badge bg="primary">
                  {userRole === "admin" ? "Administrator" : "Security Officer"}
                </Badge>
              </h1>
              <Button variant="outline-danger" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </Col>
        </Row>
        <FaceDetectionComponent userRole={userRole} />
      </Container>
    );
  }

  // Otherwise show login form
  return (
    <Container className="vh-100 d-flex align-items-center justify-content-center">
      <Row className="w-100">
        <Col md={6} className="mx-auto">
          <Card className="shadow-lg">
            <Card.Header className="bg-primary text-white text-center py-3">
              <h2>Surveillance System Login</h2>
            </Card.Header>
            <Card.Body className="p-4">
              {error && <Alert variant="danger">{error}</Alert>}

              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>Username</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Enter username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isLoading || isLocked}
                    required
                  />
                </Form.Group>

                <Form.Group className="mb-4">
                  <Form.Label>Password</Form.Label>
                  <Form.Control
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading || isLocked}
                    required
                  />
                </Form.Group>

                <Button
                  variant="primary"
                  type="submit"
                  className="w-100"
                  disabled={isLoading || isLocked}
                >
                  {isLoading ? (
                    <>
                      <Spinner
                        as="span"
                        animation="border"
                        size="sm"
                        role="status"
                        aria-hidden="true"
                        className="me-2"
                      />
                      Authenticating...
                    </>
                  ) : (
                    "Login"
                  )}
                </Button>
              </Form>

              <div className="mt-3 text-center">
                <small className="text-muted">
                  Access restricted to authorized personnel only.
                </small>
              </div>
            </Card.Body>
            <Card.Footer className="text-center text-muted py-3">
              Surveillance Face Detection System
            </Card.Footer>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default AdminLogin;
