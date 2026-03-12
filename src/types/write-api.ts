/**
 * Types for Figma Write API operations.
 * Covers Variables, Dev Resources, and Comments write endpoints.
 *
 * Naming: snake_case for MCP-facing types; camelCase conversion happens
 * at the API boundary in client.ts.
 */

// ─── Color Values ────────────────────────────────────────

/** RGBA color with float channels 0–1 (Figma native format). */
export interface ColorValue {
  r: number;
  g: number;
  b: number;
  a: number;
}

// ─── Variable Alias ──────────────────────────────────────

export interface VariableAlias {
  type: 'VARIABLE_ALIAS';
  id: string;
}

// ─── Variable Types ──────────────────────────────────────

export type VariableType = 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
export type VariableValue = boolean | number | string | ColorValue | VariableAlias;

export type ActionType = 'CREATE' | 'UPDATE' | 'DELETE';

// ─── Variables API Request Types ─────────────────────────

export interface VariableCollectionChange {
  action: ActionType;
  id?: string;
  name?: string;
  initial_mode_id?: string;
  hidden_from_publishing?: boolean;
}

export interface VariableModeChange {
  action: ActionType;
  id?: string;
  name?: string;
  variable_collection_id?: string;
}

export interface VariableChange {
  action: ActionType;
  id?: string;
  name?: string;
  variable_collection_id?: string;
  resolved_type?: VariableType;
  scopes?: string[];
  hidden_from_publishing?: boolean;
}

export interface VariableModeValueChange {
  variable_id: string;
  mode_id: string;
  value: VariableValue;
}

/** Request body for POST /v1/files/{file_key}/variables */
export interface PostVariablesRequestBody {
  variableCollections?: Array<{
    action: ActionType;
    id?: string;
    name?: string;
    initialModeId?: string;
    hiddenFromPublishing?: boolean;
  }>;
  variableModes?: Array<{
    action: ActionType;
    id?: string;
    name?: string;
    variableCollectionId?: string;
  }>;
  variables?: Array<{
    action: ActionType;
    id?: string;
    name?: string;
    variableCollectionId?: string;
    resolvedType?: VariableType;
    scopes?: string[];
    hiddenFromPublishing?: boolean;
  }>;
  variableModeValues?: Array<{
    variableId: string;
    modeId: string;
    value: VariableValue;
  }>;
}

/** Response from POST /v1/files/{file_key}/variables */
export interface PostVariablesResponse {
  status: number;
  error: boolean;
  meta?: {
    tempIdToRealId?: Record<string, string>;
    variableCollections?: Record<string, FigmaVariableCollectionResponse>;
    variables?: Record<string, FigmaVariableResponse>;
  };
}

// ─── Variables API Response Types (GET) ──────────────────

export interface FigmaVariableCollectionResponse {
  id: string;
  name: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
  hiddenFromPublishing: boolean;
  variableIds: string[];
}

export interface FigmaVariableResponse {
  id: string;
  name: string;
  variableCollectionId: string;
  resolvedType: VariableType;
  valuesByMode: Record<string, VariableValue>;
  scopes: string[];
  hiddenFromPublishing: boolean;
}

export interface GetLocalVariablesResponse {
  status: number;
  error: boolean;
  meta?: {
    variableCollections: Record<string, FigmaVariableCollectionResponse>;
    variables: Record<string, FigmaVariableResponse>;
  };
}

// ─── Dev Resources Types ─────────────────────────────────

export interface DevResourceCreateRequest {
  name: string;
  url: string;
  file_key: string;
  node_id: string;
}

export interface DevResourceUpdateRequest {
  id: string;
  name?: string;
  url?: string;
}

export interface DevResourceResponse {
  id: string;
  name: string;
  url: string;
  file_key: string;
  node_id: string;
}

export interface GetDevResourcesResponse {
  dev_resources: DevResourceResponse[];
}

// ─── Comments Types ──────────────────────────────────────

export interface CommentVector {
  x: number;
  y: number;
}

export interface CommentFrameOffset {
  node_id: string;
  node_offset: CommentVector;
}

export type CommentClientMeta = CommentVector | CommentFrameOffset;

export interface CommentUser {
  handle: string;
  img_url: string;
  id: string;
}

export interface FigmaComment {
  id: string;
  message: string;
  file_key: string;
  parent_id: string;
  user: CommentUser;
  created_at: string;
  resolved_at: string | null;
  order_id: string | null;
  client_meta?: CommentClientMeta;
}

export interface PostCommentRequest {
  message: string;
  comment_id?: string;
  client_meta?: CommentClientMeta;
}

export interface GetCommentsResponse {
  comments: FigmaComment[];
}

// ─── Structured Write Error ──────────────────────────────

export interface FigmaWriteError {
  status: number;
  message: string;
  endpoint: string;
}
