import React from "react";
import type { ModalProps } from "@mantine/core";
import {
  Modal,
  Stack,
  Text,
  ScrollArea,
  Flex,
  CloseButton,
  Textarea,
  Button,
  Group,
  TextInput,
} from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";
import type { Path } from "../../../utils/updateValueAtPath";

/**
 * Filters an object to only include primitive values (string, number, boolean, null)
 * Excludes nested objects and arrays from the result
 */
const primitiveOnly = (obj: unknown) => {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) {
      out[k] = v;
    }
  }
  return out;
};

/**
 * Converts a node path array into JSONPath format string
 * Example: ["users", 0, "name"] becomes "$[\"users\"][0][\"name\"]"
 */
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

// Fields that cannot be edited in the modal
const READ_ONLY_KEYS = new Set(["color"]);

/**
 * Modal component for editing JSON node values
 * Allows inline editing of object properties or raw JSON values
 */
export const NodeModal = ({ opened, onClose }: ModalProps) => {
  // Get the currently selected node from graph store
  const nodeData = useGraph(s => s.selectedNode);
  // Get graph utilities for updating selections
  const { nodes, setSelectedNode } = useGraph();
  // Get JSON store utilities for updating values
  const updateAtPath = useJson(s => s.updateAtPath);
  // Get the raw JSON string from store
  const rawJson = useJson(s => s.json);

  // Extract path and metadata from selected node
  const path = (nodeData?.path ?? []) as Path;
  const rows = nodeData?.text ?? [];
  const selectedId = nodeData?.id;

  // Retrieve the actual value at the selected node path from the JSON
  const currentNodeValue = React.useMemo(() => {
    try {
      const root = JSON.parse(rawJson || "{}") as unknown;
      let cur: any = root;
      // Navigate through the path to find the target value
      for (const seg of path) {
        if (cur == null) return undefined;
        cur = cur[seg as any];
      }
      return cur;
    } catch {
      return undefined;
    }
  }, [rawJson, path]);

  // Determine if the current node is a plain object (vs array or primitive)
  const isObjectNode =
    typeof currentNodeValue === "object" &&
    currentNodeValue !== null &&
    !Array.isArray(currentNodeValue);

  // Generate default JSON text representation from node rows
  const defaultText = React.useMemo(() => {
    if (!rows || rows.length === 0) return "{}";
    if (rows.length === 1 && !rows[0].key) return `${rows[0].value}`;
    const obj: Record<string, unknown> = {};
    // Build object from primitive rows only
    rows.forEach(r => {
      if (r.key && r.type !== "array" && r.type !== "object") obj[r.key] = r.value;
    });
    return JSON.stringify(obj, null, 2);
  }, [rows]);

  // Modal state management
  const [isEditing, setIsEditing] = React.useState(false); // Whether the modal is in edit mode
  const [textDraft, setTextDraft] = React.useState(defaultText); // Raw JSON text being edited
  const [fieldDrafts, setFieldDrafts] = React.useState<Record<string, string>>({}); // Object field values being edited

  // Reset editing state and field values when modal opens or node changes
  React.useEffect(() => {
    setIsEditing(false);
    initializeFieldDrafts();
  }, [opened, isObjectNode, currentNodeValue, defaultText]);

  // Enable edit mode
  const onEdit = () => setIsEditing(true);

  /**
   * Initialize draft fields based on node type
   * For objects: create string copies of each primitive field
   * For non-objects: use the default JSON text representation
   */
  const initializeFieldDrafts = () => {
    if (isObjectNode && currentNodeValue && typeof currentNodeValue === "object") {
      const next: Record<string, string> = {};
      Object.entries(currentNodeValue as Record<string, unknown>).forEach(([k, v]) => {
        if (v === null || ["string", "number", "boolean"].includes(typeof v)) {
          next[k] = String(v);
        }
      });
      setFieldDrafts(next);
    } else {
      setTextDraft(defaultText);
      setFieldDrafts({});
    }
  };

  // Discard edits and exit edit mode
  const onCancel = () => {
    initializeFieldDrafts();
    setIsEditing(false);
  };

  /**
   * Convert input string to match the original value's type
   * Maintains type consistency when editing (e.g., "123" -> 123 for numbers)
   */
  const coerceLike = (orig: unknown, input: string): unknown => {
    if (typeof orig === "number") {
      const n = Number(input);
      return Number.isNaN(n) ? orig : n;
    }
    if (typeof orig === "boolean") {
      const t = input.trim().toLowerCase();
      return t === "true" ? true : t === "false" ? false : orig;
    }
    if (orig === null) {
      const t = input.trim().toLowerCase();
      return t === "null" ? null : input;
    }
    return input;
  };

  /**
   * Refresh the selected node after saving changes
   * Ensures the UI reflects updated node data from the store
   */
  const refreshSelection = React.useCallback(() => {
    if (!selectedId) return;
    setTimeout(() => {
      const latest = useGraph.getState().nodes.find(n => n.id === selectedId);
      if (latest) setSelectedNode(latest);
    }, 0);
  }, [selectedId, setSelectedNode]);

  /**
   * Save changes to the JSON node
   * For objects: update individual field values with type coercion
   * For non-objects: parse and save the raw JSON text
   */
  const onSave = () => {
    if (isObjectNode && currentNodeValue && typeof currentNodeValue === "object") {
      const nextObj: Record<string, unknown> = { ...(currentNodeValue as any) };

      // Update each edited field with type coercion
      for (const [k, draftVal] of Object.entries(fieldDrafts)) {
        if (READ_ONLY_KEYS.has(k)) continue; // Skip read-only fields
        const orig = (currentNodeValue as any)[k];
        if (orig === null || ["string", "number", "boolean"].includes(typeof orig)) {
          nextObj[k] = coerceLike(orig, draftVal);
        }
      }

      updateAtPath(path, nextObj);
      setIsEditing(false);
      refreshSelection();
    } else {
      // Handle raw JSON text input
      let next: unknown = textDraft;
      try {
        next = JSON.parse(textDraft);
      } catch (error) {
        console.error("Failed to parse JSON:", error);
      }
      updateAtPath(path, next);
      setIsEditing(false);
      refreshSelection();
    }
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>Content</Text>
            <Group gap="xs">
              {!isEditing ? (
                <Button size="xs" onClick={onEdit}>Edit</Button>
              ) : (
                <>
                  <Button size="xs" color="green" onClick={onSave}>Save</Button>
                  <Button size="xs" color="red" variant="light" onClick={onCancel}>Cancel</Button>
                </>
              )}
              <CloseButton onClick={onClose} />
            </Group>
          </Flex>

          {!isEditing && (
            <ScrollArea.Autosize mah={250} maw={600}>
              <CodeHighlight
                code={
                  isObjectNode
                    ? JSON.stringify(primitiveOnly(currentNodeValue), null, 2)
                    : defaultText
                }
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            </ScrollArea.Autosize>
          )}


          {isEditing && isObjectNode && (
            <Stack gap="xs">
              {Object.keys(fieldDrafts).map(key => (
                <TextInput
                  key={key}
                  label={key}
                  value={fieldDrafts[key] ?? ""}
                  onChange={e =>
                    setFieldDrafts(d => ({ ...d, [key]: e.currentTarget.value }))
                  }
                  disabled={READ_ONLY_KEYS.has(key)}
                />
              ))}
            </Stack>
          )}

          {isEditing && !isObjectNode && (
            <Textarea
              value={textDraft}
              onChange={e => setTextDraft(e.currentTarget.value)}
              minRows={6}
              autosize
              spellCheck={false}
            />
          )}
        </Stack>

        <Text fz="xs" fw={500}>JSON Path</Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};