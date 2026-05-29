/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Action_RenameInputs */

const uk_songs_action_rename = /** @type {(inputs: Songs_Action_RenameInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Перейменувати…`)
};

const en_songs_action_rename = /** @type {(inputs: Songs_Action_RenameInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Rename…`)
};

/**
* | output |
* | --- |
* | "Rename…" |
*
* @param {Songs_Action_RenameInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_action_rename = /** @type {((inputs?: Songs_Action_RenameInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Action_RenameInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_action_rename(inputs)
	return en_songs_action_rename(inputs)
});