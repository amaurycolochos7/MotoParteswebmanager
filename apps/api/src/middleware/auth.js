import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'motopartes-secret-key-change-in-production';

export function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

export function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

// Fastify hook for authentication
export async function authenticate(request, reply) {
    try {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.status(401).send({ error: 'No autorizado' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);
        request.user = decoded;
    } catch (err) {
        return reply.status(401).send({ error: 'Token inválido' });
    }
}

// Check admin role
export async function requireAdmin(request, reply) {
    await authenticate(request, reply);
    if (reply.sent) return;
    if (request.user.role !== 'admin') {
        return reply.status(403).send({ error: 'Acceso denegado: se requiere rol admin' });
    }
}
