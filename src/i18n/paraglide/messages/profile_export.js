/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_ExportInputs */

const uk_profile_export = /** @type {(inputs: Profile_ExportInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Експортувати`)
};

const en_profile_export = /** @type {(inputs: Profile_ExportInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Export`)
};

/**
* | output |
* | --- |
* | "Export" |
*
* @param {Profile_ExportInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_export = /** @type {((inputs?: Profile_ExportInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_ExportInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_export(inputs)
	return en_profile_export(inputs)
});