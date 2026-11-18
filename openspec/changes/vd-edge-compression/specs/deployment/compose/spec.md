# Spec Delta

## ADDED Requirements

### Requirement: Compressed web text responses
The web container SHALL gzip HTML, JavaScript, CSS, SVG and JSON responses when the client accepts gzip and the response meets the configured minimum size. It SHALL emit `Vary: Accept-Encoding`, retain immutable caching on hashed `/assets/`, and leave already-compressed image formats uncompressed.

#### Scenario: Request compressed text assets
- **WHEN** a client requests an eligible HTML, JavaScript, CSS, SVG or JSON response with gzip accepted
- **THEN** the web container returns gzip encoded content and includes `Vary: Accept-Encoding`
- **AND** hashed assets retain immutable caching

#### Scenario: Request an already-compressed image
- **WHEN** a client requests a supported image format that is already compressed
- **THEN** the web container does not gzip encode the response
