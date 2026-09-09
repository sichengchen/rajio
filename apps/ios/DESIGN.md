# iOS design

Apple’s [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines) and [component guidance](https://developer.apple.com/design/human-interface-guidelines/components) govern Rajio’s iOS interface. Desktop contributes the listening workflows and library behavior. iOS uses its own native components and layout.

## Typography

Use system semantic text styles and preserve Dynamic Type and Bold Text support. At the standard content size, body text is 17 pt. Primary list labels use Body; section headings use Headline; show, episode, and player titles use Title 3. Secondary information uses Subheadline, Footnote, or Caption according to its importance. Root navigation uses compact inline titles. Avoid adding a second large title beneath a navigation title.

Source: [Typography](https://developer.apple.com/design/human-interface-guidelines/typography).

## Components

- `TabView` provides Home, Library, and Search. Let the system position tabs for iPhone and iPad.
- `NavigationStack` provides hierarchical navigation and system back controls.
- `List`, `Section`, `Label`, and `NavigationLink` provide Library navigation, row selection, separators, and disclosure indicators.
- Artwork collections use an adaptive grid at standard text sizes and full-width rows with wrapping titles at accessibility sizes; episode lists keep titles and summaries concise and open full details on selection.
- RSS entry uses `Form` and a URL `TextField`. Cancel and Add occupy the standard sheet toolbar positions.
- Settings use native pickers, toggles, and forms. Destructive actions use the destructive role and an explicit confirmation.
- Playback uses native sliders, volume and route controls, and a system tab accessory for the mini player.

Sources: [Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables), [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars), [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets), [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons).

## Materials and adaptation

Keep Liquid Glass in the navigation and control layer, using system components wherever possible. Use semantic system backgrounds for content. Respect safe areas, light/dark appearances, accessibility text sizes, and iPad layouts. Verify both default and accessibility text sizes; screenshots at accessibility sizes do not define the default visual scale.

Sources: [Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Layout](https://developer.apple.com/design/human-interface-guidelines/layout).
