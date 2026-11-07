import type { FastifyRequest } from 'fastify';
import type { LibreTvClient } from '../services/libretv-client.js';
import type { MovieIds } from '../services/movie-id.js';
export interface RouteContext { client:LibreTvClient; ids:MovieIds; signal:(request:FastifyRequest)=>AbortSignal }
