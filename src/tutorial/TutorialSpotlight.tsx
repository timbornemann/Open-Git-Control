import { useId } from 'react';
import { spotlightGeometry, type SpotlightBox } from './spotlightGeometry';

export function TutorialSpotlight({ target, workspace }: { target: SpotlightBox; workspace: SpotlightBox }) {
  const maskId = useId();
  const geometry = spotlightGeometry(target, workspace);
  if (!geometry) return null;
  const { hole, arrow } = geometry;
  return (
    <>
      <svg
        className="tutorial-spotlight"
        aria-hidden="true"
        focusable="false"
        viewBox={`0 0 ${workspace.width} ${workspace.height}`}
        style={{ left: workspace.left, top: workspace.top, width: workspace.width, height: workspace.height }}
      >
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={workspace.width} height={workspace.height}>
            <rect width={workspace.width} height={workspace.height} fill="white" />
            <rect className="tutorial-spotlight-hole" x={hole.left} y={hole.top} width={hole.width} height={hole.height} rx="7" fill="black" />
          </mask>
        </defs>
        <rect className="tutorial-focus-shade" width={workspace.width} height={workspace.height} mask={`url(#${maskId})`} />
        {arrow && (
          <g className="tutorial-target-arrow" data-direction={arrow.side}>
            <path className="tutorial-arrow-outline" d={arrow.path} />
            <path className="tutorial-arrow-stroke" d={arrow.path} />
          </g>
        )}
      </svg>
      <div
        className="tutorial-highlight"
        aria-hidden="true"
        style={{ left: workspace.left + hole.left, top: workspace.top + hole.top, width: hole.width, height: hole.height }}
      />
    </>
  );
}
