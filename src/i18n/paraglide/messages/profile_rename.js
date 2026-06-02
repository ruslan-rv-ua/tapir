/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_RenameInputs */

const uk_profile_rename = /** @type {(inputs: Profile_RenameInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Перейменувати`)
};

const en_profile_rename = /** @type {(inputs: Profile_RenameInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Rename`)
};

/**
* | output |
* | --- |
* | "Rename" |
*
* @param {Profile_RenameInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_rename = /** @type {((inputs?: Profile_RenameInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_RenameInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_rename(inputs)
	return en_profile_rename(inputs)
});