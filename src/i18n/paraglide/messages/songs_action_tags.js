/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Action_TagsInputs */

const uk_songs_action_tags = /** @type {(inputs: Songs_Action_TagsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Редагувати теги…`)
};

const en_songs_action_tags = /** @type {(inputs: Songs_Action_TagsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Edit tags…`)
};

/**
* | output |
* | --- |
* | "Edit tags…" |
*
* @param {Songs_Action_TagsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_action_tags = /** @type {((inputs?: Songs_Action_TagsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Action_TagsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_action_tags(inputs)
	return en_songs_action_tags(inputs)
});