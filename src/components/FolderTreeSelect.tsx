import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Loader2 } from 'lucide-react';
import type { InputDialogOption } from '@/app/state/contracts';

type Props = {
  value: string;
  options: InputDialogOption[];
  loadChildren?: (parentValue: string) => Promise<InputDialogOption[]>;
  onChange: (value: string) => void;
};

const parentPath = (value: string): string => (value.includes('/') ? value.slice(0, value.lastIndexOf('/')) : '');

export const FolderTreeSelect: React.FC<Props> = ({ value, options, loadChildren, onChange }) => {
  const [allOptions, setAllOptions] = useState(options);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']));
  const [loadedParents, setLoadedParents] = useState<Set<string>>(() => new Set(['']));
  const [loadingParents, setLoadingParents] = useState<Set<string>>(new Set());
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setAllOptions(options);
    setExpanded(new Set(['']));
    setLoadedParents(new Set(['']));
    setLoadingParents(new Set());
    setLoadErrors({});
  }, [options]);

  const optionByValue = useMemo(() => new Map(allOptions.map((option) => [option.value, option])), [allOptions]);
  const childrenByParent = useMemo(() => {
    const result = new Map<string, InputDialogOption[]>();
    for (const option of allOptions) {
      if (!option.value) continue;
      const parent = parentPath(option.value);
      const children = result.get(parent) || [];
      children.push(option);
      result.set(parent, children);
    }
    for (const children of result.values()) children.sort((left, right) => left.label.localeCompare(right.label));
    return result;
  }, [allOptions]);

  const toggleFolder = async (folderPath: string) => {
    if (expanded.has(folderPath)) {
      setExpanded((current) => {
        const next = new Set(current);
        next.delete(folderPath);
        return next;
      });
      return;
    }

    setExpanded((current) => new Set(current).add(folderPath));
    if (!loadChildren || loadedParents.has(folderPath) || loadingParents.has(folderPath)) return;

    setLoadingParents((current) => new Set(current).add(folderPath));
    try {
      const children = await loadChildren(folderPath);
      setAllOptions((current) => {
        const next = new Map(current.map((option) => [option.value, option]));
        children.forEach((option) => next.set(option.value, option));
        return [...next.values()];
      });
      setLoadedParents((current) => new Set(current).add(folderPath));
      setLoadErrors((current) => {
        const next = { ...current };
        delete next[folderPath];
        return next;
      });
    } catch (error: unknown) {
      setLoadErrors((current) => ({ ...current, [folderPath]: error instanceof Error ? error.message : String(error) }));
    } finally {
      setLoadingParents((current) => {
        const next = new Set(current);
        next.delete(folderPath);
        return next;
      });
    }
  };

  const renderNode = (option: InputDialogOption, depth: number): React.ReactNode => {
    const children = childrenByParent.get(option.value) || [];
    const isExpanded = expanded.has(option.value);
    const isLoading = loadingParents.has(option.value);
    const canExpand = children.length > 0 || Boolean(loadChildren && !loadedParents.has(option.value));
    const selected = !option.disabled && option.value === value;
    return (
      <React.Fragment key={option.value || 'repository-root'}>
        <div
          className={`dialog-folder-tree__row${selected ? ' dialog-folder-tree__row--selected' : ''}`}
          style={{ paddingLeft: 6 + depth * 18 }}
          role="treeitem"
          aria-selected={selected}
          aria-expanded={canExpand ? isExpanded : undefined}
        >
          {canExpand ? (
            <button
              type="button"
              className="dialog-folder-tree__toggle"
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${option.label}`}
              data-dialog-no-enter
              onClick={() => void toggleFolder(option.value)}
            >
              {isLoading ? <Loader2 className="dialog-folder-tree__spinner" size={14} /> : isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="dialog-folder-tree__toggle-placeholder" />
          )}
          <button
            type="button"
            className="dialog-folder-tree__option"
            aria-disabled={option.disabled || undefined}
            data-dialog-no-enter
            title={option.value || option.label}
            onClick={() => {
              if (option.disabled) {
                if (canExpand) void toggleFolder(option.value);
                return;
              }
              onChange(option.value);
            }}
          >
            {isExpanded ? <FolderOpen size={15} /> : <Folder size={15} />}
            <span>{option.label}</span>
          </button>
        </div>
        {loadErrors[option.value] && (
          <div className="dialog-folder-tree__error" style={{ paddingLeft: 28 + depth * 18 }}>
            {loadErrors[option.value]}
          </div>
        )}
        {isExpanded && children.map((child) => renderNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  const rootOption = optionByValue.get('') || { value: '', label: 'Repository root', disabled: true };
  const selectedOption = optionByValue.get(value);

  return (
    <>
      <div className="dialog-folder-tree" role="tree" aria-label="Destination folder">
        {renderNode(rootOption, 0)}
      </div>
      {selectedOption && !selectedOption.disabled && (
        <small className="dialog-folder-tree__selection">Selected: {selectedOption.value || selectedOption.label}</small>
      )}
    </>
  );
};
