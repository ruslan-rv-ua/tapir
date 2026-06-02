/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_Active_BadgeInputs */

const uk_profile_active_badge = /** @type {(inputs: Profile_Active_BadgeInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`активний`)
};

const en_profile_active_badge = /** @type {(inputs: Profile_Active_BadgeInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`active`)
};

/**
* | output |
* | --- |
* | "active" |
*
* @param {Profile_Active_BadgeInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_active_badge = /** @type {((inputs?: Profile_Active_BadgeInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Active_BadgeInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_active_badge(inputs)
	return en_profile_active_badge(inputs)
});