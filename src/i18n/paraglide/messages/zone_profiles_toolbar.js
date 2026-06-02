/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Zone_Profiles_ToolbarInputs */

const uk_zone_profiles_toolbar = /** @type {(inputs: Zone_Profiles_ToolbarInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Дії з профілями`)
};

const en_zone_profiles_toolbar = /** @type {(inputs: Zone_Profiles_ToolbarInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Profile actions`)
};

/**
* | output |
* | --- |
* | "Profile actions" |
*
* @param {Zone_Profiles_ToolbarInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const zone_profiles_toolbar = /** @type {((inputs?: Zone_Profiles_ToolbarInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Zone_Profiles_ToolbarInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_zone_profiles_toolbar(inputs)
	return en_zone_profiles_toolbar(inputs)
});