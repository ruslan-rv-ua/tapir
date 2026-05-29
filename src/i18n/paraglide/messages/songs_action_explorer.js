/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Action_ExplorerInputs */

const uk_songs_action_explorer = /** @type {(inputs: Songs_Action_ExplorerInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Відкрити в Explorer`)
};

const en_songs_action_explorer = /** @type {(inputs: Songs_Action_ExplorerInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Open in Explorer`)
};

/**
* | output |
* | --- |
* | "Open in Explorer" |
*
* @param {Songs_Action_ExplorerInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_action_explorer = /** @type {((inputs?: Songs_Action_ExplorerInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Action_ExplorerInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_action_explorer(inputs)
	return en_songs_action_explorer(inputs)
});